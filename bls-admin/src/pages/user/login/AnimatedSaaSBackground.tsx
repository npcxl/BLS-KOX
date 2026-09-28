/**
 * 登录页背景：**一张静态插画**（`public/login-bg.png`，真实尺寸 1672×941，勿改）。
 *
 * 演进记录（2026-09-28 收敛到此版本）：
 *   1. 最早是「动态 SaaS 背景」：鼠标视差 / SVG 数据流 / 发光节点 / 光点流动 / 呼吸光 / 扫描光；
 *   2. 之后做过 v2（图片放进 SVG 共用坐标系）与 v3（左侧「产品能力地图」：
 *      React 节点卡片 + hover 裂开 + 展开面板 + 连线高亮，文件 TechNode.tsx / TechNode.css / techNodes.tsx）；
 *   3. **v3 及全部额外动画/卡片已按要求整体删除**，只保留插画本体（猫 / 桌椅 / 办公室 / 线路）。
 *
 * 说明：组件名沿用 `AnimatedSaaSBackground` 是为了不动调用方，它现在**不含任何动画**；
 *       如需改名（如 `LoginBackground`）与文件名一起改即可。
 */
import './AnimatedSaaSBackground.css';

export default function AnimatedSaaSBackground() {
  return (
    <div className="bls-login-background">
      <img className="bls-login-background__image" src="/login-bg.png" alt="" draggable={false} />
    </div>
  );
}
