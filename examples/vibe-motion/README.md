# 本地动效素材库

八类独立实现的动效，包含可操作预览、可复用代码和时间轴接入示例。核心模块没有额外依赖；使用现有渲染环境导出视频。不占用正式期号，也不修改已有成片。

## 打开预览

在仓库根目录运行：

```bash
npm run preview:motion
```

打开终端给出的本地地址。左侧切换动效，下方可以播放、暂停和拖动进度；修改强调色、对象形状、演示时长、动作幅度与结果文字。与当前动效无关的参数会禁用。端口默认5588，可通过环境变量`MOTION_PREVIEW_PORT`指定；用Ctrl+C关闭服务。

预览源码：[index.html](index.html)、[app.mjs](app.mjs)；动效绘制演示：[demos.mjs](demos.mjs)；可复用状态计算：[motion.js](../../templates/vibe-motion/motion.js)。演示物件与六秒时长都可以替换，不是每期必须使用的构图或时长。

## 八类动效

所有进度参数`p`使用0～1，超出范围按端点处理。函数不创建播放循环、不读取真实时间、不改变输入数组，同一输入得到同一状态。坐标和绘制对象由本期决定，不锁定1920×1080；只有演示画布采用该尺寸。

| 函数 | 输入与返回 | 使用位置 |
|---|---|---|
| `travel(points,p)` | 输入有序坐标；返回当前`point`、已经过的`visible`点列和朝向`angle`。按路径长度推进；曲线可先采样为点列 | 路径生长、前进、绕行；多条路径共享分叉节点 |
| `morph(from,to,p,options)` | 两组数量相同的坐标按下标对应；返回中间坐标。`stagger`默认0.18，设为0可同步，须小于1；`arc`默认80，可设为0或负数 | 点、图标、物件的聚合分离与形态重组 |
| `contact(p,options)` | `distance`默认280、`bounce`默认90、`hit`默认0.42且须在0～1之间；返回`y/scaleX/scaleY/shock`，落点为0 | 下落、接触压缩、回弹与环境响应 |
| `camera(from,to,p)` | 起终点`x/y/scale/rotation`；返回观看中心、尺度和弧度角度 | 世界坐标的观看范围变化，所有空间层共用相机状态 |
| `reflow(from,to,keep,p,options)` | 等长起终点与布尔保留数组；返回`x/y/id/opacity`，不改变对象身份。移动选项同`morph` | 筛选、群体分流、对象重排；退出对象的目标位置仍由本期安排 |
| `scan(rect,p)` | 输入`x/y/width/height`；返回已显现矩形及前沿`front` | 用返回矩形裁切新状态的绘制，底稿与结果保持同一对象位置 |
| `focus(from,to,p)` | 输入两组`x/y/radius`；返回中间焦点 | 注意范围、局部强调与视觉中心交接 |
| `burst(origin,p,options)` | 输入触发点；`count`默认48、`seed`默认7、`radius`默认360；返回每个粒子的坐标、方向、尺寸及透明度 | 接触或揭示瞬间的冲击扩散；不默认给每次切镜加粒子 |

对象形状不写在核心模块里。圆、文字、人物部件或本期图标都可使用返回的坐标与变换。可直接复用状态计算，按需取用演示中的绘制方式；不要把整个演示画面仅替换标题后当作正式视频。

## 接入本期制作

在制作索引对应幕的`visual_assets`中加入`templates/vibe-motion/motion.js`。正式构建会复制为`assets/motion.js`，画面HTML按这个路径导入；使用构建后的目录预览，直接打开画面源目录时须另行准备相同的素材路径。

在本幕已有绘制函数里计算进度并绘制，继续共用原来那一条暂停时间轴，不给每项素材创建独立时钟。例如：

```js
import {morph} from './assets/motion.js';
const from = [{x:500,y:400},{x:800,y:400},{x:1100,y:400}];
const to = [{x:700,y:650},{x:960,y:300},{x:1220,y:650}];
const start = 2, duration = 1.6;

function drawObjects(t) {
  const points = morph(from, to, (t-start)/duration, {arc:100,stagger:0.15});
  // ctx是本幕画布，绘制前由本幕统一清屏。
  for (const point of points) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 36, 0, Math.PI*2);
    ctx.fill();
  }
}
// 在已有时间轴的绘制回调中调用drawObjects(当前幕内秒数)。
```

需要将对象隐藏到入场时刻之前时，由本幕按时间控制是否绘制；`p=0`代表初始状态，不代表自动隐藏。按本期安排接续、字幕、音效和结果停留，遵守[画面组织方法](../../course/docs/vibe/visual_methods.md)及[实际验收](../../course/docs/vibe/visual_review.md)。字幕字号、必要标注和点题规则继续沿用现行SOP。

## 独立验证与渲染

以下命令不会改变正式制作索引；输出放在被忽略的`.local/vibe-motion/`。将`morph`替换为表中的其他函数名即可验证对应动效：

```bash
node --test tests/node/vibe_motion.test.mjs
node --env-file-if-exists=.env examples/vibe-motion/check.mjs
node --env-file-if-exists=.env examples/vibe-motion/run.mjs prepare morph
node --env-file-if-exists=.env examples/vibe-motion/run.mjs render morph
```

`check`复用本机Chrome和已有渲染环境中的浏览器驱动，检查八类预览、参数替换、倒退定位、实际播放与时间轴接入，报告和截图位于`.local/vibe-motion/check/`。`prepare`复制最新代码和字体并生成单条暂停时间轴；`render`先准备、再执行既有HyperFrames检查与high质量、30fps、2个worker渲染，输出如`.local/vibe-motion/morph/morph.mp4`。二者重复运行覆盖对应技术示例，正式期次不受影响。

自动检查不能证明本期叙事与视觉表现已经通过。使用这些动效后，仍须检查主体是否随讲解发展、动作中途是否可辨、必要文字是否被挡住，以及整幕与前后的接续。
