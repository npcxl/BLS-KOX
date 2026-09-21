/**
 * 二级验证图片生成（后端 SVG）测试
 * 关注：随机背景 / 随机切片位置 / 随机扰动、SVG 合法、答案只以「数值」形式返回给调用方（服务端）。
 */
import { describe, it, expect } from 'vitest';
import { buildPuzzlePath, generateRotateImage, generateSliderImages } from '../image';
import { ROTATE_CANVAS_SIZE, SLIDER_CANVAS_HEIGHT, SLIDER_CANVAS_WIDTH, SLIDER_PIECE_SIZE } from '../types';

describe('captcha image — slider', () => {
  it('生成合法 SVG，切片位置在画布范围内', () => {
    for (let i = 0; i < 20; i++) {
      const img = generateSliderImages();
      expect(img.backgroundSvg.startsWith('<svg')).toBe(true);
      expect(img.backgroundSvg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(img.backgroundSvg.endsWith('</svg>')).toBe(true);
      expect(img.pieceSvg.endsWith('</svg>')).toBe(true);

      expect(img.canvasWidth).toBe(SLIDER_CANVAS_WIDTH);
      expect(img.canvasHeight).toBe(SLIDER_CANVAS_HEIGHT);
      expect(img.pieceSize).toBe(SLIDER_PIECE_SIZE);

      expect(img.pieceX).toBeGreaterThanOrEqual(SLIDER_PIECE_SIZE + 20);
      expect(img.pieceX).toBeLessThanOrEqual(SLIDER_CANVAS_WIDTH - SLIDER_PIECE_SIZE - 10);
      expect(img.pieceY).toBeGreaterThanOrEqual(8);
      expect(img.pieceY).toBeLessThanOrEqual(SLIDER_CANVAS_HEIGHT - SLIDER_PIECE_SIZE - 8);

      // 切片图通过 viewBox 裁剪同一份美术层 → 背景与切片共享完全相同的形状标记
      expect(img.pieceSvg).toContain(`viewBox="${img.pieceX} ${img.pieceY} ${SLIDER_PIECE_SIZE} ${SLIDER_PIECE_SIZE}"`);
    }
  });

  it('切片位置与背景随机（多次生成不重复）', () => {
    const xs = new Set<number>();
    const bgs = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const img = generateSliderImages();
      xs.add(img.pieceX);
      bgs.add(img.backgroundSvg.slice(0, 400));
    }
    expect(xs.size).toBeGreaterThan(1);
    expect(bgs.size).toBeGreaterThan(1);
  });

  it('拼图轮廓随机（凸起 / 凹槽位置可变），显式指定时确定', () => {
    expect(buildPuzzlePath(44, { bump: true, notch: true })).toContain('Q');
    expect(buildPuzzlePath(44, { bump: false, notch: false })).toBe(buildPuzzlePath(44, { bump: false, notch: false }));
    expect(buildPuzzlePath(44, { bump: true, notch: false })).not.toBe(buildPuzzlePath(44, { bump: false, notch: false }));
  });
});

describe('captcha image — rotate', () => {
  it('旋转角来自 20°–340° 步长 20°，且 SVG 中真实施加了该旋转', () => {
    const angles = new Set<number>();
    for (let i = 0; i < 30; i++) {
      const img = generateRotateImage();
      expect(img.canvasSize).toBe(ROTATE_CANVAS_SIZE);
      expect(img.svg).toContain(`rotate(${img.angle} ${ROTATE_CANVAS_SIZE / 2} ${ROTATE_CANVAS_SIZE / 2})`);
      expect(img.angle % 20).toBe(0);
      expect(img.angle).toBeGreaterThanOrEqual(20);
      expect(img.angle).toBeLessThanOrEqual(340);
      angles.add(img.angle);
    }
    expect(angles.size).toBeGreaterThan(1);
  });

  it('包含固定的正方向参考标记（不随图片旋转）', () => {
    const img = generateRotateImage();
    // 参考箭头在 rotate 分组之前
    const markerIdx = img.svg.indexOf('polygon points=');
    const rotateIdx = img.svg.indexOf('<g transform="rotate(');
    expect(markerIdx).toBeGreaterThan(-1);
    expect(rotateIdx).toBeGreaterThan(markerIdx);
  });
});
