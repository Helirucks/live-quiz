(function () {
  const canvas = document.getElementById("matrix-bg");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  // Zeichensatz: Ziffern, Python-Syntax-Symbole, ein paar Buchstaben
  const CHARS = "01{}[]()<>+-=*/_.:;#01PYTHONpython01".split("");
  const FONT_SIZE = 16;
  const FADE_ALPHA = 0.08;
  const FRAME_MS = 50;

  let columns = 0;
  let drops = [];

  function setup() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    columns = Math.ceil(canvas.width / FONT_SIZE);
    drops = new Array(columns).fill(0).map(() => Math.floor(Math.random() * -50));
    ctx.font = FONT_SIZE + "px 'JetBrains Mono', monospace";
    ctx.fillStyle = "#03100a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function tick() {
    // leichtes Ausblenden des vorherigen Frames -> Trail-Effekt
    ctx.fillStyle = "rgba(3, 16, 10, " + FADE_ALPHA + ")";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < columns; i++) {
      const char = CHARS[(Math.random() * CHARS.length) | 0];
      const x = i * FONT_SIZE;
      const y = drops[i] * FONT_SIZE;

      // heller "Kopf" des Tropfens
      ctx.fillStyle = "#c8ffe0";
      ctx.fillText(char, x, y);

      // dunkleres Nachglühen direkt darüber
      ctx.fillStyle = "rgba(57, 255, 20, 0.45)";
      ctx.fillText(CHARS[(Math.random() * CHARS.length) | 0], x, y - FONT_SIZE);

      if (y > canvas.height && Math.random() > 0.975) {
        drops[i] = 0;
      }
      drops[i] += 1;
    }
  }

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(setup, 200);
  });

  setup();

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduceMotion) {
    setInterval(tick, FRAME_MS);
  }
})();
