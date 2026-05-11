module.exports = {
  appId: 'com.kk.stickynotes',
  productName: 'KK便利贴',
  directories: {
    output: 'release'
  },
  win: {
    target: 'portable',
    icon: 'assets/icon.png',
    signAndEditExecutable: false
  },
  portable: {
    artifactName: 'KK便利贴-${version}.exe'
  },
  files: [
    'src/**/*',
    'package.json',
    'assets/**/*'
  ]
};
