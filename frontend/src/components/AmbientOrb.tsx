import { DotLottieReact } from '@lottiefiles/dotlottie-react';

/**
 * AmbientOrb — A Lottie-based animated sphere/orb for the empty state.
 * Uses DotLottieReact for smooth, GPU-accelerated animation.
 */
export default function AmbientOrb() {
  return (
    <div className="ambient-orb-container">
      <DotLottieReact
        src="https://lottie.host/4db68bbd-31f6-4cd8-84eb-189de081159a/IGmMCqhzpt.lottie"
        loop
        autoplay
        style={{
          width: '280px',
          height: '280px',
          opacity: 1,
          filter: 'saturate(0.5) brightness(0.95)',
        }}
      />
    </div>
  );
}
