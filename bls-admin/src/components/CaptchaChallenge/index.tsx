/**
 * 第二层可视化人机验证弹窗（滑块拼图 / 图像旋转）
 *
 * 可用性要求：
 *   - PC 与移动端均可操作（触摸 + 鼠标 + 键盘）；
 *   - 统一使用 antd Slider（原生支持触摸拖动与方向键），从而**保留纯键盘可操作的替代路径**，
 *     避免「只有滑块才能登录」；
 *   - 提供刷新验证码、关闭、加载状态与失败反馈。
 *
 * 安全说明：前端拿不到正确答案，只能提交用户操作结果，允许误差由服务端判定。
 */
import { ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Modal, Slider, Spin, Typography } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  verifyCaptchaSecondary,
  type CaptchaChallenge,
} from '@/services/auth/captcha';

export interface CaptchaChallengeModalProps {
  open: boolean;
  challenge: CaptchaChallenge | null;
  username: string;
  loading?: boolean;
  /** 验证成功 → 回传一次性 captchaToken */
  onSuccess: (captchaToken: string) => void;
  /** 用户主动关闭 */
  onClose: () => void;
  /** 刷新验证码（重新获取 challenge） */
  onRefresh: () => void;
  /** 失败反馈（由调用方决定是否 toast） */
  onFail?: (reason: string) => void;
}

const REASON_TEXT: Record<string, string> = {
  ANSWER_MISMATCH: '验证未通过，请重试',
  MISSING_ANSWER: '请先完成拖动',
  CHALLENGE_EXPIRED: '验证码已过期，正在刷新',
  CHALLENGE_NOT_FOUND: '验证码已失效，正在刷新',
  CHALLENGE_STAGE_MISMATCH: '验证码状态异常，正在刷新',
  MAX_ATTEMPTS: '尝试次数过多，请重新验证',
  TOKEN_BINDING_MISMATCH: '验证环境发生变化，请重新验证',
};

export default function CaptchaChallengeModal({
  open,
  challenge,
  username,
  loading = false,
  onSuccess,
  onClose,
  onRefresh,
  onFail,
}: CaptchaChallengeModalProps) {
  const [value, setValue] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const verifyingRef = useRef(false);

  const payload = challenge?.payload ?? null;
  const secondaryType = challenge?.secondaryType ?? 'slider';
  const canvasWidth = payload?.canvasWidth ?? 320;
  const canvasHeight = payload?.canvasHeight ?? 160;
  const pieceSize = payload?.pieceSize ?? 44;
  const pieceY = payload?.pieceY ?? 10;
  const maxSlider = Math.max(1, canvasWidth - pieceSize);
  const keyboardStep = payload?.keyboardStep ?? 4;

  // 新 challenge → 复位
  useEffect(() => {
    setValue(0);
    setError(null);
    verifyingRef.current = false;
    setVerifying(false);
  }, [challenge?.challengeId]);

  const submit = useCallback(async () => {
    if (!challenge || verifyingRef.current || verifying) return;
    verifyingRef.current = true;
    setVerifying(true);
    setError(null);
    try {
      const answer = secondaryType === 'rotate' ? { angle: value } : { x: value };
      const res = await verifyCaptchaSecondary({
        challengeId: challenge.challengeId,
        username,
        answer,
        nonce: challenge.nonce,
      });
      const data: any = (res as any)?.data ?? {};

      if (res.code === 200 && data.passed && data.captchaToken) {
        onSuccess(String(data.captchaToken));
        return;
      }

      const reason = String(data.reason ?? 'ANSWER_MISMATCH');
      setError(REASON_TEXT[reason] ?? '验证未通过，请重试');
      onFail?.(reason);
      setValue(0);

      const needRefresh =
        data.retryable === false
        || reason === 'MAX_ATTEMPTS'
        || reason === 'CHALLENGE_EXPIRED'
        || reason === 'CHALLENGE_NOT_FOUND'
        || reason === 'CHALLENGE_STAGE_MISMATCH'
        || reason === 'TOKEN_BINDING_MISMATCH';
      if (needRefresh) onRefresh();
    } catch {
      setError('验证请求失败，请刷新后重试');
      setValue(0);
    } finally {
      verifyingRef.current = false;
      setVerifying(false);
    }
  }, [challenge, onFail, onRefresh, onSuccess, secondaryType, username, value, verifying]);

  const modalWidth = useMemo(() => Math.min(canvasWidth + 96, 440), [canvasWidth]);
  const busy = loading || verifying;
  const hint = payload?.hint ?? (secondaryType === 'rotate' ? '旋转图片使其回正' : '拖动滑块使拼图归位');
  const keyboardHint = payload?.keyboardHint ?? '可用左右方向键操作，Enter 提交';

  return (
    <Modal
      open={open}
      title="安全验证"
      centered
      maskClosable={false}
      keyboard={false}
      width={modalWidth}
      style={{ maxWidth: '94vw', top: 24 }}
      okButtonProps={{ style: { display: 'none' } }}
      cancelText="关闭"
      confirmLoading={busy}
      onCancel={onClose}
      footer={[
        <Button key="refresh" icon={<ReloadOutlined />} onClick={onRefresh} disabled={busy}>
          刷新验证码
        </Button>,
        <Button key="close" onClick={onClose}>
          关闭
        </Button>,
        <Button key="submit" type="primary" loading={busy} onClick={submit}>
          验证
        </Button>,
      ]}
    >
      <Spin spinning={busy} tip={loading ? '正在获取验证码…' : '验证中…'}>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          {hint}
        </Typography.Paragraph>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          {secondaryType === 'rotate' ? (
            <div
              style={{
                width: canvasWidth,
                height: canvasHeight,
                maxWidth: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#141414',
                borderRadius: 6,
                overflow: 'hidden',
              }}
            >
              {payload?.imageUrl ? (
                <img
                  alt="请旋转图片使其回正"
                  src={payload.imageUrl}
                  draggable={false}
                  style={{
                    width: canvasWidth,
                    height: canvasHeight,
                    maxWidth: '100%',
                    transform: `rotate(${value}deg)`,
                    transition: 'transform 80ms linear',
                    userSelect: 'none',
                  }}
                />
              ) : null}
            </div>
          ) : (
            <div
              style={{
                position: 'relative',
                width: canvasWidth,
                height: canvasHeight,
                maxWidth: '100%',
                borderRadius: 6,
                overflow: 'hidden',
                background: '#141414',
              }}
            >
              {payload?.backgroundImageUrl ? (
                <img
                  alt="拼图背景"
                  src={payload.backgroundImageUrl}
                  draggable={false}
                  style={{ width: canvasWidth, height: canvasHeight, maxWidth: '100%', userSelect: 'none' }}
                />
              ) : null}
              {payload?.pieceImageUrl ? (
                <img
                  alt="拼图切片"
                  src={payload.pieceImageUrl}
                  draggable={false}
                  style={{
                    position: 'absolute',
                    left: value,
                    top: pieceY,
                    width: pieceSize,
                    height: pieceSize,
                    userSelect: 'none',
                    filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.55))',
                  }}
                />
              ) : null}
            </div>
          )}
        </div>

        <Slider
          min={secondaryType === 'rotate' ? -180 : 0}
          max={secondaryType === 'rotate' ? 180 : maxSlider}
          step={secondaryType === 'rotate' ? keyboardStep : 1}
          value={value}
          onChange={setValue}
          onChangeComplete={submit}
          tooltip={{ open: false }}
          keyboard
          disabled={busy || !challenge}
        />

        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {keyboardHint}
        </Typography.Text>

        {error ? (
          <Alert style={{ marginTop: 12 }} type="error" showIcon message={error} />
        ) : null}
      </Spin>
    </Modal>
  );
}
