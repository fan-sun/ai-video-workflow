import assert from "node:assert/strict";
import test from "node:test";

import {
  verifyEmbeddedCoverWindow,
  verifyPublishedMedia,
} from "../../build/common/check_course_release.mjs";

const SPEC = {
  width: 1080,
  height: 1440,
  fps: 30,
  video_codec: "h264",
  video_profiles: ["Main", "High"],
  pixel_format: "yuv420p",
  audio_codec: "aac",
  audio_sample_rate: 48000,
  audio_channels: 1,
  duration_s: 10,
  duration_tolerance_s: 0.1,
};

function successfulMediaRunner({
  width = 1080,
  duration = 10.02,
  reviewMd5 = "same",
  publishMd5 = "same",
  decodeStatus = 0,
} = {}) {
  return (command, args) => {
    if (command === "ffprobe") {
      return {
        status: 0,
        stdout: JSON.stringify({
          streams: [
            {
              codec_type: "video",
              codec_name: "h264",
              profile: "Main",
              width,
              height: 1440,
              pix_fmt: "yuv420p",
              r_frame_rate: "30/1",
            },
            {
              codec_type: "audio",
              codec_name: "aac",
              sample_rate: "48000",
              channels: 1,
            },
          ],
          format: { duration: String(duration), size: "12345" },
        }),
        stderr: "",
      };
    }
    if (args.includes("md5")) {
      const input = args[args.indexOf("-i") + 1];
      const md5 = input.includes("review") ? reviewMd5 : publishMd5;
      return { status: 0, stdout: `MD5=${md5}\n`, stderr: "" };
    }
    return { status: decodeStatus, stdout: "", stderr: decodeStatus ? "decode failed" : "" };
  };
}

test("发布媒体接受 Main Profile 并核对完整规格、解码和音频", () => {
  const result = verifyPublishedMedia({
    publishFile: "publish.mp4",
    reviewFile: "review.mp4",
    spec: SPEC,
    spawnSyncImpl: successfulMediaRunner(),
  });

  assert.equal(result.duration_s, 10.02);
  assert.equal(result.profile, "Main");
  assert.equal(result.audio_md5, "same");
});

test("发布媒体实际分辨率与规格不一致时拒绝", () => {
  assert.throws(
    () => verifyPublishedMedia({
      publishFile: "publish.mp4",
      reviewFile: "review.mp4",
      spec: SPEC,
      spawnSyncImpl: successfulMediaRunner({ width: 720 }),
    }),
    /分辨率.*720.*1080/,
  );
});

test("发布媒体规格缺少必需字段时在调用 FFmpeg 前拒绝", () => {
  const incomplete = { ...SPEC };
  delete incomplete.fps;
  let calls = 0;

  assert.throws(
    () => verifyPublishedMedia({
      publishFile: "publish.mp4",
      reviewFile: "review.mp4",
      spec: incomplete,
      spawnSyncImpl: () => {
        calls += 1;
        return { status: 0, stdout: "", stderr: "" };
      },
    }),
    /publish_spec\.fps/,
  );
  assert.equal(calls, 0);
});

test("发布媒体实际时长超出编码尾差时拒绝", () => {
  assert.throws(
    () => verifyPublishedMedia({
      publishFile: "publish.mp4",
      reviewFile: "review.mp4",
      spec: SPEC,
      spawnSyncImpl: successfulMediaRunner({ duration: 10.5 }),
    }),
    /实际时长.*10\.5.*10/,
  );
});

test("发布媒体无法完整解码时拒绝", () => {
  assert.throws(
    () => verifyPublishedMedia({
      publishFile: "publish.mp4",
      reviewFile: "review.mp4",
      spec: SPEC,
      spawnSyncImpl: successfulMediaRunner({ decodeStatus: 1 }),
    }),
    /完整解码失败/,
  );
});

test("审片版与发布版解码音频不一致时拒绝", () => {
  assert.throws(
    () => verifyPublishedMedia({
      publishFile: "publish.mp4",
      reviewFile: "review.mp4",
      spec: SPEC,
      spawnSyncImpl: successfulMediaRunner({ reviewMd5: "old", publishMd5: "new" }),
    }),
    /解码音频不一致/,
  );
});

test("封面在 0.5 秒内稳定且下一帧切入正文", () => {
  const scores = [0.99, 0.98, 0.4];
  const seekTimes = [];
  const filters = [];
  const result = verifyEmbeddedCoverWindow({
    videoFile: "publish.mp4",
    coverFile: "cover.png",
    durationS: 0.5,
    fps: 30,
    threshold: 0.97,
    spawnSyncImpl: (_command, args) => {
      seekTimes.push(Number(args[args.indexOf("-ss") + 1]));
      filters.push(args[args.indexOf("-lavfi") + 1]);
      return {
        status: 0,
        stdout: "",
        stderr: `SSIM Y:0.9 U:0.9 V:0.9 All:${scores.shift()} (10.0)`,
      };
    },
  });

  assert.deepEqual(result, {
    first_ssim: 0.99,
    last_cover_ssim: 0.98,
    first_content_ssim: 0.4,
  });
  assert.deepEqual(seekTimes, [0, 0.466, 0.533]);
  assert.ok(filters.every((filter) => filter.includes("ssim=shortest=1")));
  assert.ok(filters.every((filter) => filter.includes("setpts=PTS-STARTPTS")));
});

test("封面在 0.5 秒后仍未消失时拒绝", () => {
  const scores = [0.99, 0.98, 0.98];
  assert.throws(
    () => verifyEmbeddedCoverWindow({
      videoFile: "publish.mp4",
      coverFile: "cover.png",
      durationS: 0.5,
      fps: 30,
      threshold: 0.97,
      spawnSyncImpl: () => ({
        status: 0,
        stdout: "",
        stderr: `SSIM All:${scores.shift()} (10.0)`,
      }),
    }),
    /0\.5 秒后仍是正式封面/,
  );
});
