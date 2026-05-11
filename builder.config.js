module.exports = {
  appId: 'com.kk.kktap',
  productName: 'KKTap',
  directories: {
    output: 'release'
  },
  win: {
    target: 'portable',
    icon: 'assets/icon.png',
    signAndEditExecutable: false
  },
  portable: {
    artifactName: 'KKTap-${version}.exe'
  },
  files: [
    'src/**/*',
    'package.json',
    'assets/**/*'
  ]
};
