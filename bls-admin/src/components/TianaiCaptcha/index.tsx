/**
 * 第二层人机验证组件 —— Tianai CAPTCHA（SLIDER 滑块拼图 / WORD_IMAGE_CLICK 点选文字）
 *
 * **唯一契约 = Tianai 官方 `ImageCaptchaTrack` DTO**（cloud.tianai.captcha.validator.common.model.dto）：
 *
 *   {
 *     bgImageWidth: Integer,        // 背景图宽（像素）
 *     bgImageHeight: Integer,       // 背景图高（像素）
 *     templateImageWidth: Integer,  // 模板图宽
 *     templateImageHeight: Integer, // 模板图高
 *     startTime: Long,              // 滑动开始（毫秒时间戳）
 *     stopTime: Long,               // 滑动结束（毫秒时间戳）
 *     trackList: [{ x: Float, y: Float, t: Float, type: 'DOWN'|'MOVE'|'UP'|'CLICK' }]
 *   }
 *
 * 关键点（都是历史踩坑）：
 *   1. 尺寸**只能**来自上游 `backgroundImageWidth/Height` 与 `templateImageWidth/Height`，
 *      绝不用 320x160 / 50x50 之类的猜测值；缺失即视为加载失败，提示刷新。
 *   2. 上游没有 `randomY`：SLIDER 的模板图是**整条背景等高**的图，缺口 Y 已烘焙在图里，
 *      组件只做水平拖动，不需要（也不允许）自己猜 Y。
 *   3. 滑块轨迹必须以「模板图左上角在背景图中的绝对坐标」记录 x：
 *      官方校验是 `(last.x - first.x) / bgImageWidth ≈ randomX / bgImageWidth`。
 *   4. 点选验证必须以 `type: 'CLICK'` + **像素坐标**记录每一次点击（官方按百分比换算），
 *      历史实现提交自定义 `{points}` 会被官方反序列化直接拒绝。
 *   5. 轨迹同时支持 pointer / touch / 键盘（方向键微调 + 回车提交），三种路径产出的
 *      trackList 结构完全一致。
 *
 * 组件不做任何判定：图片、尺寸、类型全部来自服务端转发的 Tianai 数据，判定在服务端
 * （Koa → Tianai `/captcha/verify`）。
 */
import { ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Space, Spin, Typography } from 'antd';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SecondaryChallenge } from '@/services/auth/captcha';

/** 官方 `TrackTypeConstant` */
export const TRACK_TYPE = {
  DOWN: 'DOWN',
  MOVE: 'MOVE',
  UP: 'UP',
  CLICK: 'CLICK',
} as const;

export type TianaiTrackType = (typeof TRACK_TYPE)[keyof typeof TRACK_TYPE];

/** 鼠标 / 触摸事件来源（避免同一手势被 pointer 与 touch 各记一遍） */
type InputSource = 'pointer' | 'touch' | 'keyboard';

export interface TianaiTrackPoint {
  x: number;
  y: number;
  t: number;
  type: TianaiTrackType;
}

/** 官方 `ImageCaptchaTrack`（前端只提交这些字段） */
export interface ImageCaptchaTrackDto {
  bgImageWidth: number;
  bgImageHeight: number;
  templateImageWidth?: number;
  templateImageHeight?: number;
  startTime: number;
  stopTime: number;
  trackList: TianaiTrackPoint[];
}

/** WORD_IMAGE_CLICK 官方默认点击数量（`StandardWordClickImageCaptchaGenerator.checkClickCount = 4`） */
export const TIANAI_DEFAULT_CLICK_COUNT = 4;

/** 键盘微调步长（像素，背景图坐标系） */
const KEY_STEP = 4;
const KEY_STEP_FAST = 10;

export interface NormalizedTianaiChallenge {
  /** 组件渲染模式（由上游 type 推导） */
  kind: 'slider' | 'clickWord';
  /** 上游原始 type（SLIDER / CONCAT / ROTATE / WORD_IMAGE_CLICK …） */
  upstreamType: string;
  backgroundImage: string;
  templateImage: string | null;
  bgImageWidth: number;
  bgImageHeight: number;
  templateImageWidth: number | null;
  templateImageHeight: number | null;
  /** 点选验证码需要点击的数量（上游 data.clickCount，缺省 4） */
  clickCount: number;
}

function pickString(payload: Record<string, unknown>, key: string): string | null {
  const v = payload?.[key];
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s : null;
}

function pickNumber(payload: Record<string, unknown>, key: string): number | null {
  const v = Number((payload ?? {})[key]);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/** 归一化图片地址：上游返回 dataURL / base64 / 相对路径都能用 */
export function toImageSrc(raw: string | null): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;
  if (v.startsWith('data:') || v.startsWith('http') || v.startsWith('/')) return v;
  return `data:image/png;base64,${v}`;
}

/**
 * 解析上游 challenge（bls-captcha-service `CaptchaBridgeController` 的原始字段）。
 * **尺寸全部取自上游**；关键字段缺失 → 返回 null（调用方提示刷新，绝不猜尺寸）。
 */
export function normalizeTianaiChallenge(
  payload: Record<string, unknown> | null | undefined,
): NormalizedTianaiChallenge | null {
  if (!payload || typeof payload !== 'object') return null;

  const upstreamType = String(payload.type ?? '').trim().toUpperCase();
  const kind: NormalizedTianaiChallenge['kind'] =
    upstreamType.includes('WORD') || upstreamType.includes('CLICK') ? 'clickWord' : 'slider';

  const backgroundImage = pickString(payload, 'backgroundImage');
  const bgImageWidth = pickNumber(payload, 'backgroundImageWidth');
  const bgImageHeight = pickNumber(payload, 'backgroundImageHeight');
  if (!backgroundImage || !bgImageWidth || !bgImageHeight) return null;

  const templateImage = pickString(payload, 'templateImage');
  const templateImageWidth = pickNumber(payload, 'templateImageWidth');
  const templateImageHeight = pickNumber(payload, 'templateImageHeight');

  // 滑块必须有模板图与尺寸；否则无法定位缺口，必须刷新而不是猜
  if (kind === 'slider' && (!templateImage || !templateImageWidth || !templateImageHeight)) return null;

  const data = (payload.data ?? null) as Record<string, unknown> | null;
  const rawCount = Number(data?.clickCount);
  const clickCount = Number.isFinite(rawCount) && rawCount >= 1 && rawCount <= 10
    ? Math.round(rawCount)
    : TIANAI_DEFAULT_CLICK_COUNT;

  return {
    kind,
    upstreamType,
    backgroundImage,
    templateImage,
    bgImageWidth,
    bgImageHeight,
    templateImageWidth,
    templateImageHeight,
    clickCount,
  };
}

/** 组装官方 DTO（过滤掉无效轨迹，保证每个点都有 x/y/t/type） */
export function buildImageCaptchaTrack(
  info: NormalizedTianaiChallenge,
  startTime: number,
  stopTime: number,
  trackList: TianaiTrackPoint[],
): ImageCaptchaTrackDto {
  const dto: ImageCaptchaTrackDto = {
    bgImageWidth: Math.round(info.bgImageWidth),
    bgImageHeight: Math.round(info.bgImageHeight),
    startTime,
    stopTime,
    trackList: trackList.map((p) => ({
      x: round(p.x),
      y: round(p.y),
      t: round(p.t),
      type: p.type,
    })),
  };
  if (info.templateImageWidth) dto.templateImageWidth = Math.round(info.templateImageWidth);
  if (info.templateImageHeight) dto.templateImageHeight = Math.round(info.templateImageHeight);
  return dto;
}

function round(n: number): number {
  return Math.round(Number.isFinite(n) ? n * 10 : 0) / 10;
}

export interface TianaiCaptchaProps {
  challenge: SecondaryChallenge;
  /** 校验中 */
  loading?: boolean;
  disabled?: boolean;
  onSubmit: (data: Record<string, unknown>) => void;
  /** 重新获取 challenge（会话已消费 / 用户主动刷新） */
  onRefresh: () => void;
}

const TianaiCaptcha: React.FC<TianaiCaptchaProps> = ({ challenge, loading, disabled, onSubmit, onRefresh }) => {
  const info = useMemo(
    () => normalizeTianaiChallenge(challenge.payload as Record<string, unknown>),
    [challenge.payload],
  );

  const background = useMemo(() => toImageSrc(info?.backgroundImage ?? null), [info]);
  const piece = useMemo(() => toImageSrc(info?.templateImage ?? null), [info]);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  /** 轨迹（含 DOWN/MOVE/UP 或 CLICK） */
  const trackRef = useRef<TianaiTrackPoint[]>([]);
  const startTimeRef = useRef<number>(0);
  /** 同一手势只能由一个输入源记录 */
  const activeSourceRef = useRef<InputSource | null>(null);
  const draggingRef = useRef(false);
  const dragOriginRef = useRef<{ clientX: number; pieceX: number }>({ clientX: 0, pieceX: 0 });

  /** 滑块当前位置（背景图坐标系） */
  const [pieceX, setPieceX] = useState(0);
  const pieceXRef = useRef(0);
  pieceXRef.current = pieceX;
  /** 点选已选坐标（背景图坐标系，用于可视化） */
  const [clicks, setClicks] = useState<Array<[number, number]>>([]);
  /** 键盘准星（无障碍：方向键移动 + 回车确认） */
  const [cursor, setCursor] = useState<[number, number]>(() => [0, 0]);

  const maxPieceX = info ? Math.max(0, info.bgImageWidth - (info.templateImageWidth ?? 0)) : 0;

  // 换 challenge 时重置答案
  useEffect(() => {
    trackRef.current = [];
    startTimeRef.current = 0;
    activeSourceRef.current = null;
    draggingRef.current = false;
    setPieceX(0);
    setClicks([]);
    setCursor([Math.round((info?.bgImageWidth ?? 0) / 2), Math.round((info?.bgImageHeight ?? 0) / 2)]);
  }, [challenge.sessionId, info?.bgImageWidth, info?.bgImageHeight]);

  const interactive = !disabled && !loading && !!info;

  /** 屏幕坐标 → 背景图坐标（图片被缩放时必须换算） */
  const toImagePoint = useCallback((clientX: number, clientY: number): [number, number] => {
    if (!info) return [0, 0];
    const rect = canvasRef.current?.getBoundingClientRect();
    const scaleX = rect && rect.width > 0 ? info.bgImageWidth / rect.width : 1;
    const scaleY = rect && rect.height > 0 ? info.bgImageHeight / rect.height : 1;
    const baseX = rect?.left ?? 0;
    const baseY = rect?.top ?? 0;
    return [
      clamp((clientX - baseX) * scaleX, 0, info.bgImageWidth),
      clamp((clientY - baseY) * scaleY, 0, info.bgImageHeight),
    ];
  }, [info]);

  const submit = useCallback((trackList: TianaiTrackPoint[], startTime: number, stopTime: number) => {
    if (!info || trackList.length === 0) return;
    const track = buildImageCaptchaTrack(info, startTime, stopTime, trackList);
    onSubmit(track as unknown as Record<string, unknown>);
  }, [info, onSubmit]);

  // ---------- 滑块 ----------

  const beginSlider = useCallback((source: InputSource, clientX: number) => {
    if (!interactive || !info) return;
    if (activeSourceRef.current && activeSourceRef.current !== source) return;
    activeSourceRef.current = source;
    draggingRef.current = true;
    const now = Date.now();
    if (!startTimeRef.current) startTimeRef.current = now;
    dragOriginRef.current = { clientX, pieceX: pieceXRef.current };
    trackRef.current = [];
  }, [interactive, info]);

  const moveSlider = useCallback((source: InputSource, clientX: number, clientY: number) => {
    if (!interactive || !info || !draggingRef.current) return;
    if (activeSourceRef.current && activeSourceRef.current !== source) return;
    const [, pointerY] = toImagePoint(clientX, clientY);
    const delta = clientX - dragOriginRef.current.clientX;
    const rect = canvasRef.current?.getBoundingClientRect();
    const scaleX = rect && rect.width > 0 ? rect.width / info.bgImageWidth : 1;
    const next = clamp(dragOriginRef.current.pieceX + delta / scaleX, 0, maxPieceX);
    pieceXRef.current = next;
    setPieceX(next);
    push(trackRef.current, {
      x: next,
      y: pointerY,
      t: Date.now() - startTimeRef.current,
      type: TRACK_TYPE.MOVE,
    });
  }, [interactive, info, maxPieceX, toImagePoint]);

  const endSlider = useCallback((source: InputSource, clientX: number, clientY: number) => {
    if (!interactive || !info || !draggingRef.current) return;
    if (activeSourceRef.current && activeSourceRef.current !== source) return;
    draggingRef.current = false;
    activeSourceRef.current = null;

    const [, pointerY] = toImagePoint(clientX, clientY);
    const track = trackRef.current;
    const startTime = startTimeRef.current || Date.now();
    const stopTime = Date.now();

    // 用 pointerup / touchend 的位置补最后一次位移：
    // 用户可能在最后一次 move 之后才松手，缺了这次更新会让 (last.x - first.x) 偏小。
    const rect = canvasRef.current?.getBoundingClientRect();
    const scaleX = rect && rect.width > 0 ? rect.width / info.bgImageWidth : 1;
    const delta = clientX - dragOriginRef.current.clientX;
    const finalX = clamp(dragOriginRef.current.pieceX + delta / scaleX, 0, maxPieceX);
    pieceXRef.current = finalX;
    setPieceX(finalX);

    // 首点必须是起始位置（官方按 (last.x - first.x)/bgWidth 计算滑动百分比）
    if (track.length === 0 || track[0].type !== TRACK_TYPE.DOWN) {
      track.unshift({ x: round(dragOriginRef.current.pieceX), y: round(pointerY), t: 0, type: TRACK_TYPE.DOWN });
    } else {
      track[0] = { x: round(dragOriginRef.current.pieceX), y: round(pointerY), t: 0, type: TRACK_TYPE.DOWN };
    }
    push(track, {
      x: finalX,
      y: pointerY,
      t: stopTime - startTime,
      type: TRACK_TYPE.UP,
    });
    submit(track.slice(), startTime, stopTime);
  }, [interactive, info, maxPieceX, submit, toImagePoint]);

  // ---------- 点选 ----------

  const addClick = useCallback((x: number, y: number) => {
    if (!interactive || !info) return;
    const now = Date.now();
    if (!startTimeRef.current) startTimeRef.current = now;
    const point: TianaiTrackPoint = {
      x: round(x),
      y: round(y),
      t: round(now - startTimeRef.current),
      type: TRACK_TYPE.CLICK,
    };
    push(trackRef.current, point);
    setClicks((prev) => [...prev, [x, y]]);

    if (trackRef.current.filter((p) => p.type === TRACK_TYPE.CLICK).length >= info.clickCount) {
      submit(trackRef.current.slice(), startTimeRef.current, Date.now());
    }
  }, [interactive, info, submit]);

  // ---------- 键盘 ----------

  const stepSlider = useCallback((deltaX: number) => {
    if (!interactive || !info) return;
    const now = Date.now();
    if (!startTimeRef.current) startTimeRef.current = now;
    if (!draggingRef.current) {
      draggingRef.current = true;
      dragOriginRef.current = { clientX: 0, pieceX: pieceXRef.current };
      trackRef.current = [{ x: round(pieceXRef.current), y: 0, t: 0, type: TRACK_TYPE.DOWN }];
    }
    const next = clamp(pieceXRef.current + deltaX, 0, maxPieceX);
    pieceXRef.current = next;
    setPieceX(next);
    push(trackRef.current, { x: next, y: 0, t: now - startTimeRef.current, type: TRACK_TYPE.MOVE });
  }, [interactive, info, maxPieceX]);

  const commitKeyboard = useCallback(() => {
    if (!interactive || !info) return;
    const now = Date.now();
    if (info.kind === 'slider') {
      if (!draggingRef.current) return;      // 先按方向键再回车
      draggingRef.current = false;
      const startTime = startTimeRef.current || now;
      push(trackRef.current, {
        x: pieceXRef.current,
        y: 0,
        t: now - startTime,
        type: TRACK_TYPE.UP,
      });
      submit(trackRef.current.slice(), startTime, now);
      return;
    }
    addClick(cursor[0], cursor[1]);
  }, [addClick, cursor, info, interactive, submit]);

  // ---------- 事件绑定 ----------

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    e.preventDefault();
    const el = e.currentTarget;
    if (typeof el.setPointerCapture === 'function' && e.pointerId !== undefined) {
      try { el.setPointerCapture(e.pointerId); } catch { /* jsdom / 老浏览器忽略 */ }
    }
    if (info?.kind === 'clickWord') {
      const [x, y] = toImagePoint(e.clientX, e.clientY);
      addClick(x, y);
      return;
    }
    beginSlider('pointer', e.clientX);
    const [, pointerY] = toImagePoint(e.clientX, e.clientY);
    trackRef.current = [{
      x: round(pieceXRef.current),
      y: round(pointerY),
      t: 0,
      type: TRACK_TYPE.DOWN,
    }];
  }, [addClick, beginSlider, info?.kind, interactive, toImagePoint]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (info?.kind !== 'slider') return;
    moveSlider('pointer', e.clientX, e.clientY);
  }, [info?.kind, moveSlider]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (info?.kind !== 'slider') return;
    endSlider('pointer', e.clientX, e.clientY);
  }, [endSlider, info?.kind]);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const t = e.touches[0] ?? e.changedTouches[0];
    if (!t) return;
    if (info?.kind === 'clickWord') {
      const [x, y] = toImagePoint(t.clientX, t.clientY);
      addClick(x, y);
      return;
    }
    beginSlider('touch', t.clientX);
    const [, pointerY] = toImagePoint(t.clientX, t.clientY);
    trackRef.current = [{
      x: round(pieceXRef.current),
      y: round(pointerY),
      t: 0,
      type: TRACK_TYPE.DOWN,
    }];
  }, [addClick, beginSlider, info?.kind, interactive, toImagePoint]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (info?.kind !== 'slider') return;
    const t = e.touches[0] ?? e.changedTouches[0];
    if (!t) return;
    moveSlider('touch', t.clientX, t.clientY);
  }, [info?.kind, moveSlider]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (info?.kind !== 'slider') return;
    const t = e.changedTouches[0] ?? e.touches[0];
    endSlider('touch', t?.clientX ?? 0, t?.clientY ?? 0);
  }, [endSlider, info?.kind]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const step = e.shiftKey ? KEY_STEP_FAST : KEY_STEP;
    if (info?.kind === 'slider') {
      if (e.key === 'ArrowLeft') { stepSlider(-step); e.preventDefault(); return; }
      if (e.key === 'ArrowRight') { stepSlider(step); e.preventDefault(); return; }
      if (e.key === 'Enter' || e.key === ' ') { commitKeyboard(); e.preventDefault(); }
      return;
    }
    if (e.key === 'ArrowLeft') { setCursor(([x, y]) => [clamp(x - step, 0, info?.bgImageWidth ?? x), y]); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { setCursor(([x, y]) => [clamp(x + step, 0, info?.bgImageWidth ?? x), y]); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { setCursor(([x, y]) => [x, clamp(y - step, 0, info?.bgImageHeight ?? y)]); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { setCursor(([x, y]) => [x, clamp(y + step, 0, info?.bgImageHeight ?? y)]); e.preventDefault(); }
    else if (e.key === 'Enter' || e.key === ' ') { commitKeyboard(); e.preventDefault(); }
  }, [commitKeyboard, info, interactive, stepSlider]);

  const handleSubmitClick = useCallback(() => {
    if (!interactive || !info) return;
    if (info.kind === 'clickWord') {
      if (trackRef.current.length >= info.clickCount) {
        submit(trackRef.current.slice(), startTimeRef.current || Date.now(), Date.now());
      }
      return;
    }
    commitKeyboard();
  }, [commitKeyboard, info, interactive, submit]);

  // ---------- 渲染 ----------

  if (!info || !background) {
    return (
      <Alert
        type="warning"
        showIcon
        message="验证码加载失败"
        description={
          <Space direction="vertical" size={4}>
            <span>未能从验证服务获取完整的图形验证码数据（缺少图片或尺寸），请刷新重试。</span>
            <Button size="small" icon={<ReloadOutlined />} onClick={onRefresh}>
              刷新验证码
            </Button>
          </Space>
        }
      />
    );
  }

  const { bgImageWidth: width, bgImageHeight: height } = info;
  const clickWord = info.kind === 'clickWord';

  return (
    <div data-testid="tianai-captcha">
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
        {clickWord
          ? `请依次点击图中文字（已选 ${clicks.length}/${info.clickCount}，可用方向键移动准星 + 回车确认）`
          : '请拖动滑块完成拼图（可用左右方向键微调后回车提交）'}
      </Typography.Text>

      <div
        ref={canvasRef}
        data-testid="tianai-canvas"
        role={clickWord ? 'button' : 'slider'}
        tabIndex={0}
        aria-label={clickWord ? '点选验证码图片' : '滑块验证码图片'}
        aria-valuenow={clickWord ? clicks.length : Math.round(pieceX)}
        aria-valuemin={0}
        aria-valuemax={clickWord ? info.clickCount : Math.round(maxPieceX)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onKeyDown={handleKeyDown}
        style={{ position: 'relative', width, maxWidth: '100%', userSelect: 'none', touchAction: 'none', outline: 'none' }}
      >
        <img
          src={background}
          alt="验证图片"
          width={width}
          height={height}
          draggable={false}
          style={{ display: 'block', maxWidth: '100%' }}
        />

        {/* 滑块模板图：整条背景等高（缺口 Y 已含在图内），只随 x 平移 */}
        {!clickWord && piece && info.templateImageWidth && info.templateImageHeight && (
          <img
            src={piece}
            alt="拼图块"
            draggable={false}
            style={{
              position: 'absolute',
              left: pieceX,
              top: 0,
              width: info.templateImageWidth,
              height: info.templateImageHeight,
              pointerEvents: 'none',
            }}
          />
        )}

        {clickWord && (
          <>
            {clicks.map(([x, y], i) => (
              <span
                key={`${x}-${y}-${i}`}
                data-testid="tianai-click-mark"
                style={{
                  position: 'absolute',
                  left: `calc(${(x / width) * 100}% - 6px)`,
                  top: `calc(${(y / height) * 100}% - 6px)`,
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: '#1677ff',
                  color: '#fff',
                  fontSize: 10,
                  lineHeight: '12px',
                  textAlign: 'center',
                }}
              >
                {i + 1}
              </span>
            ))}
            <span
              data-testid="tianai-crosshair"
              style={{
                position: 'absolute',
                left: `calc(${(cursor[0] / width) * 100}% - 8px)`,
                top: `calc(${(cursor[1] / height) * 100}% - 8px)`,
                width: 16,
                height: 16,
                border: '2px dashed #1677ff',
                borderRadius: '50%',
                pointerEvents: 'none',
              }}
            />
          </>
        )}

        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.6)' }}>
            <Spin />
          </div>
        )}
      </div>

      <Space style={{ marginTop: 8 }} wrap>
        <Button
          type="primary"
          loading={loading}
          disabled={!interactive || (clickWord && clicks.length !== info.clickCount)}
          onClick={handleSubmitClick}
        >
          提交验证
        </Button>
        <Button icon={<ReloadOutlined />} disabled={loading} onClick={onRefresh}>
          刷新验证码
        </Button>
      </Space>
    </div>
  );
};

function push(list: TianaiTrackPoint[], point: TianaiTrackPoint): void {
  // 同一时间戳的重复点（拖动时连续 move 可能落在同一毫秒）没有意义，直接覆盖最后一个
  const last = list[list.length - 1];
  if (last && last.type === TRACK_TYPE.MOVE && point.type === TRACK_TYPE.MOVE && last.t === point.t) {
    list[list.length - 1] = point;
    return;
  }
  list.push(point);
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(Math.max(n, min), max);
}

export default TianaiCaptcha;
