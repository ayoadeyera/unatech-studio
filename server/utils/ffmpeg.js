const { execFile } = require("node:child_process");

function checkTool(command) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      ["-version"],
      {
        timeout: 10000,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) {
          return reject(error);
        }

        resolve(stdout.split(/\r?\n/)[0]);
      }
    );
  });
}

async function checkFFmpeg() {
  const [ffmpeg, ffprobe] = await Promise.all([
    checkTool("ffmpeg"),
    checkTool("ffprobe"),
  ]);

  return {
    ffmpeg,
    ffprobe,
  };
}

module.exports = {
  checkFFmpeg,
};