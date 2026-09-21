/**
 * 第二层人机验证组件 —— Tianai CAPTCHA（blockPuzzle 滑块拼图 / clickWord 点选文字）
 *
 * 设计要点：
 *   1. **不实现任何验证码算法**：图片、尺寸、难度全部来自服务端转发的 Tianai 数据，
 *      组件只负责渲染与收集答案，判定完全在服务端（Koa → Tianai `/check`）。
 *   2. 与第一层彻底分离：这里不再使用 altcha-widget，ALTCHA 也不是第二层。
 *   3. 键盘可用：滑块支持方向键；点选文字支持方向键移动准星 + 回车确认，
 *      保证不依赖鼠标也能完成验证（无障碍 / 纯键盘用户）。
 *   4. 数据缺失（上游未部署 / 图片字段不匹配）时给出明确提示与「刷新验证码」，不静默失败。
 *
 * 上游字段兼容（按 Deployment 实际返回调整 FIELD_CANDIDATES 即可）：
 *   背景图：backgroundImage | bgImage | originalImage | image
 *   拼图块：sliderImage | templateImage | puzzleImage | blockImage
 *   尺寸：  width/height | bgWidth/bgHeight
 */
import { ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Space, Spin, Typography } from 'antd';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SecondaryChallenge } from '@/services/auth/captcha';

const BG_FIELDS = ['backgroundImage', 'bgImage', 'originalImage', 'image'];
const PIECE_FIELDS = ['sliderImage', 'templateImage', 'puzzleImage', 'blockImage'];
const WIDTH_FIELDS = ['width', 'bgWidth', 'imageWidth'];
const HEIGHT_FIELDS = ['height', 'bgHeight', 'imageHeight'];
const PIECE_SIZE_FIELDS = ['pieceSize', 'blockSize', 'sliderWidth'];
const Y_FIELDS = ['y', 'puzzleY', 'blockY'];
const WORD_COUNT_FIELDS = ['wordCount', 'clickCount', 'count'];

function pickString(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = payload[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return null;
}

function pickNumber(payload: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = Number(payload[k]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return null;
}

/** 归一化图片地址：上游返回 dataURL / base64 / 相对路径都能用 */
function toImageSrc(raw: string | null): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;
  if (v.startsWith('data:') || v.startsWith('http') || v.startsWith('/')) return v;
  return `data:image/png;base64,${v}`;
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
  const { payload, type } = challenge;
  const background = useMemo(() => toImageSrc(pickString(payload, BG_FIELDS)), [payload]);
  const piece = useMemo(() => toImageSrc(pickString(payload, PIECE_FIELDS)), [payload]);
  const width = useMemo(() => pickNumber(payload, WIDTH_FIELDS) ?? 320, [payload]);
  const height = useMemo(() => pickNumber(payload, HEIGHT_FIELDS) ?? 160, [payload]);
  const pieceSize = useMemo(() => pickNumber(payload, PIECE_SIZE_FIELDS) ?? 50, [payload]);
  const puzzleY = useMemo(() => pickNumber(payload, Y_FIELDS) ?? Math.round(height / 3), [payload, height]);
  const wordCount = useMemo(() => Math.round(pickNumber(payload, WORD_COUNT_FIELDS) ?? 2), [payload]);

  const maxX = Math.max(0, width - pieceSize);
  const [offsetX, setOffsetX] = useState(0);
  const [points, setPoints] = useState<Array<[number, number]>>([]);
  /** 键盘准星（无障碍：方向键移动 + 回车确认） */
  const [cursor, setCursor] = useState<[number, number]>([Math.round(width / 2), Math.round(height / 2)]);

  // 换 challenge 时重置答案
  useEffect(() => {
    setOffsetX(0);
    setPoints([]);
    setCursor([Math.round(width / 2), Math.round(height / 2)]);
  }, [challenge.sessionId, width, height]);

  const interactive = !disabled && !loading;

  const commitBlockPuzzle = useCallback(() => {
    if (!interactive) return;
    // 只提交答案；阶段 / 身份由服务端决定
    onSubmit({ x: Math.round(offsetX), y: puzzleY });
  }, [interactive, offsetX, onSubmit, puzzleY]);

  const commitClickWord = useCallback(
    (next: Array<[number, number]>) => {
      if (!interactive) return;
      onSubmit({ points: next.map(([x, y]) => [Math.round(x), Math.round(y)]) });
    },
    [interactive, onSubmit],
  );

  const available = !!background;

  if (!available) {
    return (
      <Alert
        type="warning"
        showIcon
        message="验证码加载失败"
        description={
          <Space direction="vertical" size={4}>
            <span>未能从验证服务获取图形验证码，请刷新重试。</span>
            <Button size="small" icon={<ReloadOutlined />} onClick={onRefresh}>
              刷新验证码
            </Button>
          </Space>
        }
      />
    );
  }

  const crosshair = (
    <div
      role="slider"
      aria-label="键盘选择点选位置"
      aria-valuenow={cursor[0]}
      tabIndex={0}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 10 : 4;
        if (e.key === 'ArrowLeft') { setCursor(([x, y]) => [Math.max(0, x - step), y]); e.preventDefault(); }
        else if (e.key === 'ArrowRight') { setCursor(([x, y]) => [Math.min(width, x + step), y]); e.preventDefault(); }
        else if (e.key === 'ArrowUp') { setCursor(([x, y]) => [x, Math.max(0, y - step)]); e.preventDefault(); }
        else if (e.key === 'ArrowDown') { setCursor(([x, y]) => [x, Math.min(height, y + step)]); e.preventDefault(); }
        else if (e.key === 'Enter' || e.key === ' ') {
          setPoints((prev) => {
            const next: Array<[number, number]> = [...prev, cursor];
            if (next.length >= wordCount) commitClickWord(next);
            return next;
          });
          e.preventDefault();
        }
      }}
      style={{
        position: 'absolute',
        left: cursor[0] - 8,
        top: cursor[1] - 8,
        width: 16,
        height: 16,
        border: '2px dashed #1677ff',
        borderRadius: '50%',
        pointerEvents: 'none',
      }}
    />
  );

  return (
    <div data-testid="tianai-captcha">
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
        {type === 'clickWord'
          ? `请依次点击图中文字（已选 ${points.length}/${wordCount}，可用方向键移动 + 回车选择）`
          : '请拖动滑块完成拼图（可用左右方向键微调后回车提交）'}
      </Typography.Text>

      <div style={{ position: 'relative', width, maxWidth: '100%', userSelect: 'none', touchAction: 'none' }}>
        <img src={background!} alt="验证图片" width={width} height={height} draggable={false} style={{ display: 'block', maxWidth: '100%' }} />

        {type === 'blockPuzzle' && piece && (
          <img
            src={piece}
            alt="拼图块"
            draggable={false}
            style={{
              position: 'absolute',
              left: offsetX,
              top: puzzleY,
              width: pieceSize,
              height: pieceSize,
              pointerEvents: 'none',
            }}
          />
        )}

        {type === 'clickWord' && (
          <>
            {points.map(([x, y], i) => (
              <span
                key={`${x}-${y}-${i}`}
                style={{
                  position: 'absolute', left: x - 6, top: y - 6, width: 12, height: 12,
                  borderRadius: '50%', background: '#1677ff', color: '#fff', fontSize: 10, lineHeight: '12px', textAlign: 'center',
                }}
              >
                {i + 1}
              </span>
            ))}
            {crosshair}
            <div
              role="presentation"
              onClick={(e) => {
                if (!interactive) return;
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width) * width;
                const y = ((e.clientY - rect.top) / rect.height) * height;
                setPoints((prev) => {
                  const next: Array<[number, number]> = [...prev, [x, y]];
                  if (next.length >= wordCount) commitClickWord(next);
                  return next;
                });
              }}
              style={{ position: 'absolute', inset: 0, cursor: interactive ? 'crosshair' : 'not-allowed' }}
            />
          </>
        )}

        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.6)' }}>
            <Spin />
          </div>
        )}
      </div>

      {type === 'blockPuzzle' && (
        <div style={{ width, maxWidth: '100%', marginTop: 8 }}>
          <input
            type="range"
            min={0}
            max={maxX}
            step={1}
            value={offsetX}
            disabled={!interactive}
            aria-label="滑块位置"
            onChange={(e) => setOffsetX(Number(e.target.value))}
            onKeyDown={(e) => { if (e.key === 'Enter') commitBlockPuzzle(); }}
            style={{ width: '100%' }}
          />
        </div>
      )}

      <Space style={{ marginTop: 8 }} wrap>
        {type === 'blockPuzzle' ? (
          <Button type="primary" loading={loading} disabled={!interactive} onClick={commitBlockPuzzle}>
            提交验证
          </Button>
        ) : (
          <Button
            type="primary"
            loading={loading}
            disabled={!interactive || points.length !== wordCount}
            onClick={() => commitClickWord(points)}
          >
            提交验证
          </Button>
        )}
        <Button icon={<ReloadOutlined />} disabled={loading} onClick={onRefresh}>
          刷新验证码
        </Button>
      </Space>
    </div>
  );
};

export default TianaiCaptcha;
