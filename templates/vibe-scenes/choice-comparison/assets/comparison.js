// 用途：用候选扩展、选择改向和撤回替换第一幕的空碗特写。
// 运行：由重做第一幕比较.mjs复制到画面assets，由主时间轴逐帧调用。
// 依赖：既有SVG菜品与确定性时间工具；不创建额外时间轴。
window.ChoiceComparison = (() => {
  const positions = [[210,210],[470,210],[1450,210],[1710,210],[210,425],[470,425],[1450,425],[1710,425],[210,640],[470,640],[1450,640],[1710,640]];
  const attempts = [[12.65,13.15],[13.15,13.62],[13.62,14.02],[14.02,14.36],[14.36,14.72]].map((a,i)=>[...a,SceneOptions.attempts[i]]);
  function build(data, dish) {
    const paths = positions.map(([x,y],i) => '<path id="compare-path-' + i + '" d="" fill="none" stroke="#92a8a0" stroke-width="2" opacity="0"/>').join('');
    const plates = positions.map(([x,y],i) => '<g id="compare-plate-' + i + '" opacity="0" data-reveal-at="' + (11.55+Math.floor(i/4)*.13) + '" data-reveal-duration="0.8"><ellipse cy="20" rx="113" ry="67" fill="#0d2230" stroke="#58727a" stroke-width="2"/>' + dish(data[i][1],0,-8,1.18) + '<text y="84" text-anchor="middle" font-size="25" font-weight="700" style="fill:#eee5d1;color:#eee5d1">' + data[i][0] + '</text><ellipse id="compare-focus-' + i + '" cy="20" rx="120" ry="73" fill="none" stroke="#e6c28a" stroke-width="5" stroke-dasharray="35 10" opacity="0"/></g>').join('');
    document.getElementById('comparison-stage').innerHTML = '<g id="compare-paths">' + paths + '</g><path id="compare-active" fill="none" stroke="#e6c28a" stroke-width="4" stroke-linecap="round" opacity="0"/>' + plates;
  }
  function frame({t,up,key,opacity,attr,transform}) {
    const show = up(t,11.35,11.58)*(1-up(t,15.15,15.4));
    opacity('comparison-stage',show);
    document.querySelectorAll('#comparison-stage text').forEach(el => {el.style.opacity=show;});
    const exit = up(t,14.85,15.4);
    // 连接点跟随既有手机在世界镜头中的位置，候选是餐单的概念延展。
    const z=key(t,[[11.35,1.03],[12.2,1.04],[13.4,.94],[13.9,.94],[15.4,1.08]]);
    const cx=key(t,[[11.35,970],[13.9,970],[15.4,900]]);
    const cy=key(t,[[11.35,445],[12.2,445],[13.4,400],[13.9,400],[15.4,445]]);
    const originX=960+z*(1153.67133-cx), originY=432+z*(520.72083+45*up(t,14.4,15.4)-cy);
    const active = attempts.find(([a,b]) => t>=a && t<b)?.[2] ?? -1;
    for(let i=0;i<positions.length;i++) {
      const [x,y]=positions[i], enter=up(t,11.55+Math.floor(i/4)*.13,12.35+Math.floor(i/4)*.13);
      const spread=enter*(1-exit), px=originX+(x-originX)*spread, py=originY+(y-originY)*spread;
      transform('compare-plate-'+i,`translate(${px} ${py}) scale(${.18+.82*spread})`);
      opacity('compare-plate-'+i,enter*(1-exit));
      opacity('compare-focus-'+i,i===active?1:0);
      const path=`M${originX} ${originY}Q${(originX+px)/2} ${Math.max(650,py+130)} ${px} ${py+30}`;
      attr('compare-path-'+i,'d',path);
      const visited=attempts.some(([a,,target]) => target===i && t>=a);
      opacity('compare-path-'+i,spread*(visited?.45:.13));
      if(i===active)attr('compare-active','d',path);
    }
    opacity('compare-active',active>=0?(1-exit)*.9:0);
    window.__comparisonFrame={time:t,visible:show,candidate_count:positions.filter((_,i)=>t>=12.35+Math.floor(i/4)*.13 && exit<1).length,active_choice:active,confirmed_choice:null,exit};
  }
  return {build,frame};
})();
