import { useEffect, useRef } from "react";
import JSConfetti from "js-confetti";
import { useBrendisConfetti } from "~/hooks/useBrendisConfetti";

export const BrendisConfetti = ({ duration }: { duration: number }) => {
  // useBrendisConfetti({ duration });
  var scale = Math.random() * 0.7 + 0.3;
  const len = 50;
  let animations = useRef<Animation[]>([]).current;

  useEffect(() => {
    // document.body.style.transformStyle = "preserve-3d";
    const elements = document.querySelectorAll(".confetti");
    [...elements].slice(0).forEach((element, i) => {
      var player = element.animate(
        {
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
          // duration: 1000,
          iterations: Infinity,
          delay: -(Math.random() * 7000),
          // direction: "alternate",
        }
      );
      player.playbackRate = 2;
      animations.push(player);
    });
  }, []);

  return Array.from({ length: 50 }).map((_, i) => (
    <div className="confetti" key={i}>
      <div className="rotate" />
      <div className="askew" />
    </div>
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
