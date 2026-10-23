// 用途：第一幕同一手机接管、菜单展开和概念命名的独立动画层。
// 运行：由重做第一幕点题.mjs复制进画面assets，再由主时间轴按时间调用。
// 依赖：主画面的SVG对象、菜品绘制函数和确定性时间工具；不创建第二条时间轴。
window.ChoiceNaming = (() => {
  const angle = -8 * Math.PI / 180;
  const dx = 165 * .44 - 74, dy = 290 * .44 - 120;
  const phoneStart = {
    x: (200 + 880 + 74 + dx * Math.cos(angle) - dy * Math.sin(angle)) * 1.08 - 12,
    y: (438 + 120 + dx * Math.sin(angle) + dy * Math.cos(angle)) * 1.08 - 48.6,
    scale: .44 * 1.08,
  };
  function roundedFrame(w, h, r) {
    const x = -w / 2, y = -h / 2;
    return `M${x+r} ${y}H${-x-r}Q${-x} ${y} ${-x} ${y+r}V${-y-r}Q${-x} ${-y} ${-x-r} ${-y}H${x+r}Q${x} ${-y} ${x} ${-y-r}V${y+r}Q${x} ${y} ${x+r} ${y}Z`;
  }
  function build(data, dish) {
    document.getElementById('naming-candidates').innerHTML = data.slice(0, 10).map((d, i) =>
      '<g id="naming-card-' + i + '"><ellipse cy="80" rx="107" ry="14" fill="#06131c" opacity=".35"/><rect x="-110" y="-77" width="220" height="150" rx="17" fill="url(#menu-material)" stroke="#718d8e" stroke-width="1.5"/>' + dish(d[1], 0, -21, .88) + '<text y="51" text-anchor="middle" font-size="26" font-weight="700">' + d[0] + '</text><rect id="naming-focus-' + i + '" x="-116" y="-83" width="232" height="162" rx="22" fill="none" stroke="#e9c486" stroke-width="5" opacity="0"/></g>'
    ).join('');
    // SVG填色与CSS文字颜色一致，便于对比度工具读取实际颜色。
    document.querySelectorAll('#naming-stage text').forEach(el => {el.style.color = getComputedStyle(el).fill;});
  }
  function frame({t, up, key, opacity, attr, transform, room, camera}) {
    const lens = up(t, 15.4, 16.35);
    const x = phoneStart.x + (960 - phoneStart.x) * lens;
    const y = phoneStart.y + (430 - phoneStart.y) * lens;
    const scale = phoneStart.scale + (1 - phoneStart.scale) * lens;
    const rotation = -8 * (1 - lens);
    const visible = t >= 15.4 ? 1 : 0;
    opacity('naming-stage', visible);
    opacity('physical-device', 1 - visible);
    // 隐藏阶段同步文字自身透明度；可见阶段仍由原来的各层透明度控制。
    document.querySelectorAll('#naming-stage text').forEach(el => {el.style.opacity = visible;});
    if (visible) {
      const follow = `translate(${x} ${y}) rotate(${rotation+8}) scale(${scale/phoneStart.scale}) translate(${-phoneStart.x} ${-phoneStart.y})`;
      transform('world-camera', follow + ' ' + camera(t));
      opacity('world-camera', room * (1 - .86 * up(t, 16.05, 16.8)));
      opacity('room-camera', room * (1 - .55 * up(t, 16.05, 16.8)));
      transform('meal-list', 'translate(0 ' + key(t, [[0,-426],[15.6,-426],[15.85,-142],[16.1,-568],[16.32,-284],[20,-284]]) + ')');
    }
    transform('naming-phone', `translate(${x} ${y}) rotate(${rotation}) scale(${scale})`);
    opacity('scene-dimmer', up(t, 15.8, 16.65) * .55);
    opacity('naming-light', up(t, 15.8, 16.5));
    const unfold = up(t, 16.25, 17.38);
    attr('naming-housing', 'd', roundedFrame(345 + 615 * unfold, 581 - 261 * unfold, 43 - 17 * unfold));
    opacity('naming-housing', up(t, 16.25, 16.55));
    opacity('naming-content', 1 - up(t, 16.4, 16.88));
    opacity('naming-candidates', up(t, 16.3, 16.52));
    const active = t < 16.45 ? -1 : t < 16.62 ? 0 : t < 16.8 ? 7 : t < 16.98 ? 3 : t < 17.15 ? 9 : -1;
    for (let i = 0; i < 10; i++) {
      const p = up(t, 16.3 + (i % 3) * .025, 17.3 + (i % 3) * .025);
      const targetX = (i % 5 - 2) * 310, targetY = i < 5 ? -260 : 272;
      const cardY = (i < 5 ? -50 : 85) * (1 - p) + targetY * p;
      transform('naming-card-' + i, `translate(${targetX*p} ${cardY}) rotate(${(i%5-2)*(i<5?-2:2)*p}) scale(${.32+.68*p})`);
      opacity('naming-card-' + i, 1 - .42 * up(t, 17.4, 17.85));
      opacity('naming-focus-' + i, i === active ? .95 : 0);
    }
    const title = up(t, 17, 17.55);
    opacity('concept-main', title);
    transform('concept-main', `translate(0 ${18*(1-title)-24*title}) scale(${.93+.07*title})`);
    opacity('concept-rule', up(t, 17.2, 17.65));
    transform('concept-rule', `scale(${1+1.5*unfold} 1)`);
    opacity('naming-state', up(t, 17.25, 17.65));
    transform('naming-state', `translate(0 ${256-156*unfold})`);
    window.__namingFrame = {time:t, phone_origin:phoneStart, lens, unfold, active_choice:active, title, stage:visible, next_scene_visible:false};
  }
  return {build, frame};
})();
