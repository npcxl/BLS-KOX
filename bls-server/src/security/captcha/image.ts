/**
 * 二级人机验证图片生成（后端生成，无第三方依赖）
 *
 * 输出 SVG，由 `GET /api/auth/captcha/image/:imageId` 以 `no-store` 返回。
 * 随机性来源：crypto.randomInt（禁止 Math.random）。
 * 正确答案（切片 x / 旋转角）**只写入 Redis 的 challenge 记录**，绝不出现在图片或响应体内。
 *
 * 随机化设计：随机背景（渐变 + 形状 + 随机色相）、随机切片位置、随机拼图轮廓（凸起/凹槽位置随机）。
 */
import { randInt, pickOne } from './crypto-utils';
import {
  ROTATE_CANVAS_SIZE,
  SLIDER_CANVAS_HEIGHT,
  SLIDER_CANVAS_WIDTH,
  SLIDER_PIECE_SIZE,
} from './types';

/** 生成随机背景美术层（同一段标记同时用于背景图与切片图，保证像素一致） */
function buildArtwork(width: number, height: number): string {
  const hueA = randInt(0, 359);
  const hueB = (hueA + randInt(60, 300)) % 360;
  const parts: string[] = [];

  parts.push(
    `<defs><linearGradient id="bg" x1="${randInt(0, 100)}%" y1="${randInt(0, 100)}%" x2="${randInt(0, 100)}%" y2="${randInt(0, 100)}%">` +
    `<stop offset="0%" stop-color="hsl(${hueA} ${randInt(55, 90)}% ${randInt(45, 70)}%)"/>` +
    `<stop offset="100%" stop-color="hsl(${hueB} ${randInt(55, 90)}% ${randInt(35, 65)}%)"/>` +
    `</linearGradient></defs>`,
  );
  parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="url(#bg)"/>`);

  const shapeCount = randInt(7, 12);
  for (let i = 0; i < shapeCount; i++) {
    const hue = randInt(0, 359);
    const fill = `hsl(${hue} ${randInt(45, 95)}% ${randInt(30, 80)}%)`;
    const opacity = (randInt(25, 75) / 100).toFixed(2);
    const kind = randInt(0, 3);
    const cx = randInt(0, width);
    const cy = randInt(0, height);

    if (kind === 0) {
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${randInt(8, Math.max(9, Math.round(height / 2)))}" fill="${fill}" opacity="${opacity}"/>`);
    } else if (kind === 1) {
      const w = randInt(12, Math.max(13, Math.round(width / 3)));
      const h = randInt(10, Math.max(11, Math.round(height / 2)));
      parts.push(`<rect x="${cx}" y="${cy}" width="${w}" height="${h}" rx="${randInt(0, 8)}" fill="${fill}" opacity="${opacity}" transform="rotate(${randInt(0, 359)} ${cx} ${cy})"/>`);
    } else if (kind === 2) {
      const r = randInt(10, Math.max(11, Math.round(height / 2)));
      parts.push(`<polygon points="${cx},${cy - r} ${cx + r},${cy + r} ${cx - r},${cy + r}" fill="${fill}" opacity="${opacity}"/>`);
    } else {
      const r = randInt(10, Math.max(11, Math.round(height / 2)));
      parts.push(`<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${randInt(6, r)}" fill="${fill}" opacity="${opacity}"/>`);
    }
  }

  // 随机噪点（提高图像熵，降低简单 CV 识别成功率）
  const noiseCount = randInt(30, 60);
  for (let i = 0; i < noiseCount; i++) {
    parts.push(
      `<circle cx="${randInt(0, width)}" cy="${randInt(0, height)}" r="${randInt(1, 3)}" ` +
      `fill="hsl(${randInt(0, 359)} ${randInt(20, 80)}% ${randInt(20, 90)}%)" opacity="0.35"/>`,
    );
  }

  return parts.join('');
}

/**
 * 生成拼图轮廓（尺寸 size×size 的本地坐标系）。
 * 右侧随机为「凸起」或「直线」，下侧随机为「凹槽」或「直线」。
 */
export function buildPuzzlePath(size: number, opts?: { bump?: boolean; notch?: boolean }): string {
  const S = size;
  const r = Math.round(S * 0.16);          // 圆角
  const m = Math.round(S * 0.3);           // 凸起起止
  const q = Math.round(S * 0.26);          // 凸起/凹槽控制点偏移
  const bump = opts?.bump ?? randInt(0, 1) === 1;
  const notch = opts?.notch ?? randInt(0, 1) === 1;

  const rightEdge = bump
    ? `L ${S} ${m} Q ${S + q} ${S / 2} ${S} ${S - m} L ${S} ${S - r}`
    : `L ${S} ${S - r}`;
  const bottomEdge = notch
    ? `L ${S - m} ${S} Q ${S / 2} ${S - q} ${m} ${S} L ${r} ${S}`
    : `L ${r} ${S}`;

  return [
    `M ${r} 0`,
    `L ${S - r} 0`,
    `Q ${S} 0 ${S} ${r}`,
    rightEdge,
    `Q ${S} ${S} ${S - r} ${S}`,
    bottomEdge,
    `Q 0 ${S} 0 ${S - r}`,
    `L 0 ${r}`,
    `Q 0 0 ${r} 0`,
    'Z',
  ].join(' ');
}

export interface SliderImageResult {
  backgroundSvg: string;
  pieceSvg: string;
  /** 正确切片的 x 坐标（仅服务端保存） */
  pieceX: number;
  pieceY: number;
  pieceSize: number;
  canvasWidth: number;
  canvasHeight: number;
}

/** 生成滑块拼图：背景（带缺角）+ 切片（同一美术层的裁剪） */
export function generateSliderImages(): SliderImageResult {
  const width = SLIDER_CANVAS_WIDTH;
  const height = SLIDER_CANVAS_HEIGHT;
  const size = SLIDER_PIECE_SIZE;
  const artwork = buildArtwork(width, height);
  const puzzle = buildPuzzlePath(size);

  const pieceX = randInt(size + 20, width - size - 10);
  const pieceY = randInt(8, Math.max(9, height - size - 8));

  const backgroundSvg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    artwork +
    `<g transform="translate(${pieceX} ${pieceY})">` +
    `<path d="${puzzle}" fill="rgba(15,23,42,0.72)" stroke="#ffffff" stroke-width="2" stroke-opacity="0.95"/>` +
    `</g>` +
    `</svg>`;

  const pieceSvg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${pieceX} ${pieceY} ${size} ${size}">` +
    artwork +
    `<g transform="translate(${pieceX} ${pieceY})">` +
    `<path d="${puzzle}" fill="none" stroke="#ffffff" stroke-width="2" stroke-opacity="0.95"/>` +
    `</g>` +
    `</svg>`;

  return { backgroundSvg, pieceSvg, pieceX, pieceY, pieceSize: size, canvasWidth: width, canvasHeight: height };
}

export interface RotateImageResult {
  svg: string;
  /** 服务端已施加的旋转角（度），仅服务端保存 */
  angle: number;
  canvasSize: number;
}

/** 生成旋转验证图：内容被随机旋转，外围有固定的正方向参考标记 */
export function generateRotateImage(): RotateImageResult {
  const S = ROTATE_CANVAS_SIZE;
  // 避开接近 0 的角度，保证「需要旋转」的语义成立（20°–340°，步长 20°）
  const angle = pickOne(Array.from({ length: 17 }, (_, i) => i * 20 + 20));

  const hue = randInt(0, 359);
  const accent = (hue + 180) % 360;
  const inner: string[] = [];

  inner.push(`<rect x="26" y="26" width="${S - 52}" height="${S - 52}" rx="12" fill="hsl(${hue} 70% 45%)"/>`);
  // 明确的方向标记：向上的三角形
  inner.push(`<polygon points="${S / 2},38 ${S / 2 + 26},${S / 2 - 18} ${S / 2 - 26},${S / 2 - 18}" fill="hsl(${accent} 85% 88%)"/>`);
  inner.push(`<circle cx="${S / 2}" cy="${S / 2 + 24}" r="18" fill="hsl(${accent} 85% 88%)"/>`);
  // 随机不对称图案（避免不同角度的图片看起来一模一样）
  for (let i = 0; i < randInt(3, 6); i++) {
    inner.push(
      `<rect x="${randInt(30, S - 60)}" y="${randInt(30, S - 60)}" width="${randInt(6, 16)}" height="${randInt(6, 16)}" ` +
      `fill="hsl(${randInt(0, 359)} 80% ${randInt(55, 90)}%)" opacity="0.85"/>`,
    );
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">` +
    `<rect x="0" y="0" width="${S}" height="${S}" fill="hsl(220 15% 22%)"/>` +
    // 固定参考标记（不随图片旋转）：正方向的指示箭头
    `<polygon points="${S / 2},6 ${S / 2 + 7},18 ${S / 2 - 7},18" fill="#ffffff" opacity="0.9"/>` +
    `<circle cx="${S / 2}" cy="${S / 2}" r="${S / 2 - 20}" fill="none" stroke="#ffffff" stroke-opacity="0.25" stroke-width="2"/>` +
    `<g transform="rotate(${angle} ${S / 2} ${S / 2})">${inner.join('')}</g>` +
    `</svg>`;

  return { svg, angle, canvasSize: S };
}
