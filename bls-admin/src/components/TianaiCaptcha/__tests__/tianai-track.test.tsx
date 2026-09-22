/**
 * @vitest-environment jsdom
 *
 * Tianai 轨迹契约测试 —— 断言前端提交的 payload **就是**官方 `ImageCaptchaTrack` DTO。
 *
 * 官方定义（tianai-captcha 1.5.3 `validator/common/model/dto/ImageCaptchaTrack.java`）：
 *   bgImageWidth / bgImageHeight / templateImageWidth / templateImageHeight /
 *   startTime / stopTime / trackList[{ x, y, t, type }]
 *   type ∈ {DOWN, MOVE, UP, CLICK}（`TrackTypeConstant`）
 *
 * 覆盖：滑块（pointer）、滑块（键盘）、滑块（touch）、点选、尺寸缺失不猜。
 */
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

// services/auth/captcha 依赖 @umijs/max 的 request（其打包产物在 jsdom 下不可用），
// 这里只用到纯函数 secondaryTypeOf，因此把 request 换成替身。
vi.mock('@umijs/max', () => ({ request: vi.fn() }));

import TianaiCaptcha, {
  TRACK_TYPE,
  buildImageCaptchaTrack,
  normalizeTianaiChallenge,
} from '..';
import { secondaryTypeOf, type SecondaryChallenge } from '@/services/auth/captcha';

/** 与 bls-captcha-service（CaptchaBridgeController）返回字段一字不差 */
const SLIDER_PAYLOAD = {
  id: 'SLIDER-1',
  type: 'SLIDER',
  backgroundImage: 'data:image/jpeg;base64,AAAA',
  templateImage: 'data:image/png;base64,BBBB',
  backgroundImageTag: 'default',
  templateImageTag: 'default',
  backgroundImageWidth: 600,
  backgroundImageHeight: 300,
  templateImageWidth: 120,
  templateImageHeight: 300,
  data: null,
};

const CLICK_PAYLOAD = {
  id: 'WORD_IMAGE_CLICK-1',
  type: 'WORD_IMAGE_CLICK',
  backgroundImage: 'data:image/jpeg;base64,AAAA',
  templateImage: 'data:image/png;base64,TTTT',
  backgroundImageWidth: 590,
  backgroundImageHeight: 360,
  templateImageWidth: 300,
  templateImageHeight: 60,
  data: { clickCount: 3 },
};

function challenge(payload: Record<string, unknown>, type: 'blockPuzzle' | 'clickWord' = 'blockPuzzle'): SecondaryChallenge {
  return { sessionId: 'S-1', type, expiresAt: Date.now() + 60_000, payload };
}

/** jsdom 里没有真实布局：显式给出与图片像素 1:1 的 rect，便于按像素断言 */
function stubRect(el: HTMLElement, width: number, height: number) {
  el.getBoundingClientRect = () => ({
    x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height,
    toJSON: () => ({}),
  }) as DOMRect;
}

function pointer(type: 'pointerdown' | 'pointermove' | 'pointerup', clientX: number, clientY: number) {
  return new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY });
}

function touch(type: 'touchstart' | 'touchmove' | 'touchend', clientX: number, clientY: number) {
  const ev = new Event(type, { bubbles: true, cancelable: true }) as any;
  ev.touches = [{ clientX, clientY }];
  ev.changedTouches = [{ clientX, clientY }];
  return ev;
}

describe('normalizeTianaiChallenge — 只信上游字段', () => {
  it('直接消费 Java 返回的 backgroundImageWidth/Height 与 templateImage* 字段', () => {
    const info = normalizeTianaiChallenge(SLIDER_PAYLOAD);
    expect(info).not.toBeNull();
    expect(info!.kind).toBe('slider');
    expect(info!.bgImageWidth).toBe(600);
    expect(info!.bgImageHeight).toBe(300);
    expect(info!.templateImageWidth).toBe(120);
    expect(info!.templateImageHeight).toBe(300);
  });

  it('缺少尺寸 → 返回 null（绝不猜 320x160 / 50x50）', () => {
    expect(normalizeTianaiChallenge({ ...SLIDER_PAYLOAD, backgroundImageWidth: undefined })).toBeNull();
    expect(normalizeTianaiChallenge({ ...SLIDER_PAYLOAD, backgroundImageHeight: undefined })).toBeNull();
    expect(normalizeTianaiChallenge({ ...SLIDER_PAYLOAD, templateImage: undefined })).toBeNull();
    expect(normalizeTianaiChallenge({ ...SLIDER_PAYLOAD, templateImageWidth: undefined })).toBeNull();
    expect(normalizeTianaiChallenge(null)).toBeNull();
  });

  it('WORD_IMAGE_CLICK → clickWord，点击数量取上游 data.clickCount，缺省 4', () => {
    expect(normalizeTianaiChallenge(CLICK_PAYLOAD)!.kind).toBe('clickWord');
    expect(normalizeTianaiChallenge(CLICK_PAYLOAD)!.clickCount).toBe(3);
    expect(normalizeTianaiChallenge({ ...CLICK_PAYLOAD, data: null })!.clickCount).toBe(4);
  });

  it('CONCAT / ROTATE 也归入滑块类（官方 isSliderCaptcha）', () => {
    expect(normalizeTianaiChallenge({ ...SLIDER_PAYLOAD, type: 'CONCAT' })!.kind).toBe('slider');
    expect(normalizeTianaiChallenge({ ...SLIDER_PAYLOAD, type: 'ROTATE' })!.kind).toBe('slider');
  });

  it('buildImageCaptchaTrack 过滤并补齐字段类型（x/y/t 为数字，type 为官方枚举）', () => {
    const info = normalizeTianaiChallenge(SLIDER_PAYLOAD)!;
    const dto = buildImageCaptchaTrack(info, 1000, 1800, [
      { x: 0, y: 0, t: 0, type: TRACK_TYPE.DOWN },
      { x: 120.34, y: 4.06, t: 800, type: TRACK_TYPE.UP },
    ]);
    expect(dto).toEqual({
      bgImageWidth: 600,
      bgImageHeight: 300,
      templateImageWidth: 120,
      templateImageHeight: 300,
      startTime: 1000,
      stopTime: 1800,
      trackList: [
        { x: 0, y: 0, t: 0, type: 'DOWN' },
        { x: 120.3, y: 4.1, t: 800, type: 'UP' },
      ],
    });
  });
});

describe('TianaiCaptcha — 滑块（pointer 轨迹）', () => {
  it('pointerdown/move/up 产出完整 ImageCaptchaTrack（含 startTime/stopTime/trackList）', () => {
    const onSubmit = vi.fn();
    render(<TianaiCaptcha challenge={challenge(SLIDER_PAYLOAD)} onSubmit={onSubmit} onRefresh={() => {}} />);

    const canvas = screen.getByTestId('tianai-canvas');
    stubRect(canvas, 600, 300);

    fireEvent(canvas, pointer('pointerdown', 0, 10));
    fireEvent(canvas, pointer('pointermove', 60, 12));
    fireEvent(canvas, pointer('pointermove', 150, 14));
    fireEvent(canvas, pointer('pointerup', 240, 16));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const dto = onSubmit.mock.calls[0][0] as any;

    // 尺寸来自上游，不是 320x160
    expect(dto.bgImageWidth).toBe(600);
    expect(dto.bgImageHeight).toBe(300);
    expect(dto.templateImageWidth).toBe(120);
    expect(dto.templateImageHeight).toBe(300);

    expect(typeof dto.startTime).toBe('number');
    expect(typeof dto.stopTime).toBe('number');
    expect(dto.stopTime).toBeGreaterThanOrEqual(dto.startTime);

    expect(Array.isArray(dto.trackList)).toBe(true);
    for (const p of dto.trackList) {
      expect(typeof p.x).toBe('number');
      expect(typeof p.y).toBe('number');
      expect(typeof p.t).toBe('number');
      expect([TRACK_TYPE.DOWN, TRACK_TYPE.MOVE, TRACK_TYPE.UP]).toContain(p.type);
    }
    expect(dto.trackList[0].type).toBe(TRACK_TYPE.DOWN);
    expect(dto.trackList[dto.trackList.length - 1].type).toBe(TRACK_TYPE.UP);
    // 官方滑块校验：(last.x - first.x) / bgImageWidth ≈ 缺口百分比
    expect(dto.trackList[0].x).toBe(0);
    expect(dto.trackList[dto.trackList.length - 1].x).toBeCloseTo(240, 0);
  });
});

describe('TianaiCaptcha — 滑块（键盘轨迹）', () => {
  it('方向键微调 + 回车提交同样产出 DOWN/MOVE…/UP', () => {
    const onSubmit = vi.fn();
    render(<TianaiCaptcha challenge={challenge(SLIDER_PAYLOAD)} onSubmit={onSubmit} onRefresh={() => {}} />);
    const canvas = screen.getByTestId('tianai-canvas');
    stubRect(canvas, 600, 300);

    fireEvent.keyDown(canvas, { key: 'ArrowRight' });
    fireEvent.keyDown(canvas, { key: 'ArrowRight' });
    fireEvent.keyDown(canvas, { key: 'ArrowRight' });
    fireEvent.keyDown(canvas, { key: 'Enter' });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const dto = onSubmit.mock.calls[0][0] as any;
    expect(dto.trackList[0].type).toBe(TRACK_TYPE.DOWN);
    expect(dto.trackList[dto.trackList.length - 1].type).toBe(TRACK_TYPE.UP);
    expect(dto.trackList.filter((p: any) => p.type === TRACK_TYPE.MOVE).length).toBe(3);
    expect(dto.trackList[dto.trackList.length - 1].x).toBeGreaterThan(0);
  });
});

describe('TianaiCaptcha — 滑块（触摸轨迹）', () => {
  it('touchstart/touchmove/touchend 产出同样的 DTO 结构', () => {
    const onSubmit = vi.fn();
    render(<TianaiCaptcha challenge={challenge(SLIDER_PAYLOAD)} onSubmit={onSubmit} onRefresh={() => {}} />);
    const canvas = screen.getByTestId('tianai-canvas');
    stubRect(canvas, 600, 300);

    fireEvent(canvas, touch('touchstart', 0, 8));
    fireEvent(canvas, touch('touchmove', 100, 12));
    fireEvent(canvas, touch('touchend', 220, 18));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const dto = onSubmit.mock.calls[0][0] as any;
    expect(dto.bgImageWidth).toBe(600);
    expect(dto.trackList[0].type).toBe(TRACK_TYPE.DOWN);
    expect(dto.trackList[dto.trackList.length - 1].type).toBe(TRACK_TYPE.UP);
    expect(dto.trackList[dto.trackList.length - 1].x).toBeCloseTo(220, 0);
  });
});

describe('TianaiCaptcha — 点选（WORD_IMAGE_CLICK）', () => {
  it('提交 CLICK 轨迹（像素坐标），数量与上游 data.clickCount 一致', () => {
    const onSubmit = vi.fn();
    render(
      <TianaiCaptcha
        challenge={challenge(CLICK_PAYLOAD, 'clickWord')}
        onSubmit={onSubmit}
        onRefresh={() => {}}
      />,
    );
    const canvas = screen.getByTestId('tianai-canvas');
    stubRect(canvas, 590, 360);

    fireEvent(canvas, pointer('pointerdown', 100, 120));
    fireEvent(canvas, pointer('pointerdown', 300, 200));
    expect(onSubmit).not.toHaveBeenCalled();          // 还没点够

    fireEvent(canvas, pointer('pointerdown', 500, 300));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    const dto = onSubmit.mock.calls[0][0] as any;
    expect(dto.bgImageWidth).toBe(590);
    expect(dto.bgImageHeight).toBe(360);
    expect(dto.trackList).toHaveLength(3);
    for (const p of dto.trackList) {
      expect(p.type).toBe(TRACK_TYPE.CLICK);
      expect(typeof p.x).toBe('number');
      expect(typeof p.y).toBe('number');
      expect(typeof p.t).toBe('number');
    }
    // 像素坐标（不是百分比、也不是历史实现的 {points}
    expect(dto.trackList[0].x).toBeCloseTo(100, 0);
    expect(dto.trackList[2].y).toBeCloseTo(300, 0);
    expect(dto.points).toBeUndefined();
  });

  it('键盘也能点选（方向键移动准星 + 回车）', () => {
    const onSubmit = vi.fn();
    render(
      <TianaiCaptcha
        challenge={challenge(CLICK_PAYLOAD, 'clickWord')}
        onSubmit={onSubmit}
        onRefresh={() => {}}
      />,
    );
    const canvas = screen.getByTestId('tianai-canvas');
    stubRect(canvas, 590, 360);

    fireEvent.keyDown(canvas, { key: 'ArrowRight' });
    fireEvent.keyDown(canvas, { key: 'ArrowDown' });
    fireEvent.keyDown(canvas, { key: 'Enter' });
    fireEvent.keyDown(canvas, { key: 'Enter' });
    fireEvent.keyDown(canvas, { key: 'Enter' });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const dto = onSubmit.mock.calls[0][0] as any;
    expect(dto.trackList).toHaveLength(3);
    expect(dto.trackList.every((p: any) => p.type === TRACK_TYPE.CLICK)).toBe(true);
  });
});

describe('TianaiCaptcha — 上游数据不完整', () => {
  it('缺少尺寸 → 明确提示刷新，绝不提交（更不会猜尺寸）', () => {
    const onSubmit = vi.fn();
    render(
      <TianaiCaptcha
        challenge={challenge({ ...SLIDER_PAYLOAD, backgroundImageWidth: undefined, backgroundImageHeight: undefined })}
        onSubmit={onSubmit}
        onRefresh={() => {}}
      />,
    );
    expect(screen.getByText('验证码加载失败')).toBeTruthy();
    expect(screen.queryByTestId('tianai-canvas')).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('secondaryTypeOf — 前端类型映射与组件归一化一致（防漂移）', () => {
  it('WORD_IMAGE_CLICK → clickWord，其余 → blockPuzzle', () => {
    expect(secondaryTypeOf({ type: 'WORD_IMAGE_CLICK' })).toBe('clickWord');
    expect(secondaryTypeOf({ type: 'SLIDER' })).toBe('blockPuzzle');
    expect(secondaryTypeOf({ type: 'CONCAT' })).toBe('blockPuzzle');
    expect(secondaryTypeOf(null)).toBe('blockPuzzle');
  });

  it('组件归一化与 services 映射对同一 payload 得出同一种渲染模式', () => {
    // 组件用 kind = 'slider' | 'clickWord'，services 用官方语义名 blockPuzzle | clickWord
    const kindToSecondary = (kind: string) => (kind === 'clickWord' ? 'clickWord' : 'blockPuzzle');
    const clickInfo = normalizeTianaiChallenge(CLICK_PAYLOAD)!;
    const sliderInfo = normalizeTianaiChallenge(SLIDER_PAYLOAD)!;
    expect(kindToSecondary(clickInfo.kind)).toBe(secondaryTypeOf(CLICK_PAYLOAD));
    expect(kindToSecondary(sliderInfo.kind)).toBe(secondaryTypeOf(SLIDER_PAYLOAD));
  });
});
