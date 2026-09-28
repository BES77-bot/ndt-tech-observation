// Canvas signature pad. Calls onChange(pngDataUrl) after each stroke.
export function attachPad(canvas, initial, locked, onChange) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  Object.assign(ctx, { lineWidth: 2, lineCap: 'round', lineJoin: 'round', strokeStyle: '#000', fillStyle: '#000' });
  if (initial) {
    const im = new Image();
    im.onload = () => ctx.drawImage(im, 0, 0, w, h);
    im.src = initial;
  }
  if (locked) return;
  let last = null;
  const pt = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.onpointerdown = e => {
    canvas.setPointerCapture(e.pointerId);
    last = pt(e);
    ctx.beginPath(); ctx.arc(last.x, last.y, 1, 0, 7); ctx.fill();
  };
  canvas.onpointermove = e => {
    if (!last) return;
    const p = pt(e);
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last = p;
  };
  canvas.onpointerup = canvas.onpointercancel = () => {
    if (!last) return;
    last = null;
    onChange(canvas.toDataURL('image/png'));
  };
}
