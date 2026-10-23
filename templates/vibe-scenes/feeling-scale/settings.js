// 用途：声明实体天平的默认内容、复用示例与可修改范围。
// 运行：由场景页面或准备工具读取；只改这里即可创建同类内容。
// 依赖：无；比例为示意权重，范围1—3，右侧不轻于左侧。
globalThis.SceneConfig = (() => {
  const presets={
    original:{title:'感受的分量',leftLabel:'得到的乐',rightLabel:'失去的痛',leftGlyph:'乐',rightGlyph:'痛',ratio:2.25},
    focus:{title:'精力分配',leftLabel:'日常事务',rightLabel:'重点任务',leftGlyph:'日',rightGlyph:'重',ratio:3}
  };
  function normalize(settings={}){
    const value={...presets.original,...settings};
    if(Object.keys(settings).some(k=>!(k in presets.original)))throw new Error('存在未支持的场景参数');
    if(!Number.isFinite(value.ratio)||value.ratio<1||value.ratio>3)throw new Error('比例必须在1—3之间');
    for(const [key,max,label] of [['title',10,'标题'],['leftLabel',8,'左标签'],['rightLabel',8,'右标签'],['leftGlyph',1,'左侧单字'],['rightGlyph',1,'右侧单字']]){
      if(typeof value[key]!=='string'||!value[key].trim()||[...value[key]].length>max||/[\r\n<>]/.test(value[key]))throw new Error(label+'长度或内容不支持');
    }
    return value;
  }
  return {presets,normalize};
})();
