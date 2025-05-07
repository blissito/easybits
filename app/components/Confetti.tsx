import { useEffect, useRef } from "react";
import JSConfetti from "js-confetti";
import "~/styles/brendisConfetti.css"; // confetti animations
import { cn } from "~/utils/cn";

export const BrendisConfetti = ({ duration }: { duration?: number }) => {
  // @todo pause animation, stop animation (with Animation)
  const len = 50;

  useEffect(() => {
    const elements = document.querySelectorAll(".confetti");
    [...elements].slice(0).forEach((element, i) => {
      const scale = Math.random() * 0.6 + 0.5;
      const player = element.animate(
        {
          opacity: [scale],
          transform: [
            `translate3d(${
              (i / len) * 100
            }vw,-5vh,0) scale(${scale}) rotate(0turn)`,
            `translate3d(${
              (i / len) * 100 + 10
            }vw, 105vh,0) scale(${scale}) rotate(${
              Math.random() > 0.5 ? "" : "-"
            }2turn)`,
            // "skewY(10deg) translate3d(-250%, 0, 0)",
            // "skewY(-12deg) translate3d(250%, 0, 0)",
          ],
          // duration: "1s",

          // duration: Math.random() * 3000 + 4000,
        },
        {
          duration: Math.random() * 3000 + 4000,
          iterations: Infinity,
          delay: Math.random() * 5000,
          // direction: "alternate",
        }
      );

      // player.playbackRate = 2;
      // animations.push(player);
      setTimeout(() => {
        // player.pause();
      }, 5000);
    });
  }, []);

  const rand = (min = 0, max = (min = 0)) => Math.random() * (max - min) + min;

  return Array.from({ length: len }).map((_, i) => (
    <section key={i}>
      <div className="confetti">
        <div
          style={{
            animationDuration: `${rand(0.6, 2.8)}s`,
          }}
          className={cn("rotate")}
        >
          <div
            style={{
              animationDuration: `${rand(1, 2)}s`,
              animationDelay: `${rand(1, 3)}s`,
            }}
            className={cn("askew", {
              yellow: i % 2 === 0,
              purple: i % 2 !== 0,
            })}
          />
        </div>
      </div>
    </section>
  ));
};

const confettiColors = ["#9870ED", "#F3F0F5", "#FFFFFF"];
const initial = ["🎉", "👾", "💿", "🚀", "📖", "🕹", "📺"];
export const EmojiConfetti = ({
  emojis = initial,
  colors,
}: {
  colors?: boolean;
  emojis?: boolean | string[];
}) => {
  useEffect(() => {
    const jsConfetti = new JSConfetti();

    if (emojis) {
      jsConfetti.addConfetti({
        emojis: Array.isArray(emojis) ? emojis : initial,
      });
      setTimeout(() => {
        jsConfetti.addConfetti({
          emojis: Array.isArray(emojis) ? emojis : initial,
        });
      }, 2000);
      return;
    }
    jsConfetti.addConfetti({
      confettiColors: colors ? undefined : confettiColors,
    });
    setTimeout(() => {
      jsConfetti.addConfetti({
        confettiColors: colors ? undefined : confettiColors,
      });
    }, 3000);
  }, []);

  return null;
};
