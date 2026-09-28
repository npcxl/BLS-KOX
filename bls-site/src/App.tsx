import { GooeyFilter } from './components/liquid';
import { LiquidNav } from './components/liquid/LiquidNav';
import { Hero } from './sections/Hero';
import { Backends } from './sections/Backends';
import { Architecture } from './sections/Architecture';
import { Features } from './sections/Features';
import { Security } from './sections/Security';
import { Memory } from './sections/Memory';
import { CrudFactory } from './sections/CrudFactory';
import { Reliability } from './sections/Reliability';
import { Deployment } from './sections/Deployment';
import { TechStrip } from './sections/TechStrip';
import { Footer } from './sections/Footer';

export default function App() {
  return (
    <>
      <a className="skip-link" href="#overview">
        跳到主要内容
      </a>

      <GooeyFilter />
      <LiquidNav />

      <main id="main">
        <Hero />
        <Backends />
        <Architecture />
        <Features />
        <Security />
        <Memory />
        <CrudFactory />
        <Reliability />
        <Deployment />
        <TechStrip />
      </main>

      <Footer />
    </>
  );
}
