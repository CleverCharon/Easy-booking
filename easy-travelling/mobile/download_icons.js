const https = require('https');
const fs = require('fs');
const path = require('path');

const download = (url, dest) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest);
      reject(err);
    });
  });
};

const dir = path.join(__dirname, 'src/assets/images/tabbar');
if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
}

const run = async () => {
  console.log('Downloading icons...');
  try {
    // Inactive: Outline
    await download(
      'https://raw.githubusercontent.com/google/material-design-icons/master/png/action/home/materialiconsoutlined/48dp/2x/outline_home_black_48dp.png',
      path.join(dir, 'home_final.png')
    );
    // Active: Filled
    await download(
      'https://raw.githubusercontent.com/google/material-design-icons/master/png/action/home/materialicons/48dp/2x/baseline_home_black_48dp.png',
      path.join(dir, 'home-active_final.png')
    );
    console.log('Icons downloaded successfully!');
  } catch (e) {
    console.error('Download failed:', e);
  }
};

run();
