# cordova-practice
该实践采用的版本为

- [cordova-js V5.0.1-dev](https://github.com/apache/cordova-js)
- [cordova-android V8.1.0-dev](https://github.com/apache/cordova-android)
- [cordova-ios V5.1.0-dev](https://github.com/apache/cordova-ios)

## 前期准备

1. clone以上三个项目到本地，三个放在相同的目录下

2. 全局安装grunt-cli

   ```js
   npm install -g grunt-cli
   ```

3. 安装cordova-js依赖，并运行grunt

   ```cmd
   npm install
   grunt
   ```

   注意，grunt在执行打包命令时，会读取cordova-js的package.json文件

   ```json
   "cordova-platforms": {
       "cordova-android": "../cordova-android",
       "cordova-ios": "../cordova-ios",
       "cordova-windows": "../cordova-windows",
       "cordova-osx": "../cordova-osx",
       "cordova-browser": "../cordova-browser"
     }
   ```

   根据该配置分别打包不同环境的cordova.xxx.js

   因为暂时只对android和ios分析，只clone了cordova-android和cordova-ios，运行命令

   ```
   grunt compile:android
   grunt compile:ios
   ```

   只会安装这两个环境下的js文件

不难看出，当你阅读完源码后，就可以自己自定制的生成cordova源文件，相当不错

## 代码结构

### cordova-js

通用：

- src/common/argscheck.js 用于 plugin 中校验参数，比如 argscheck.checkArgs('fFO', 'Camera.getPicture', arguments); 参数应该是2个函数1个对象
- src/common/base64.js JS->Native 交互时对 ArrayBuffer 进行 uint8ToBase64（WebSockets 二进制流）
- src/common/builder.js 对象属性操作，比如把一个对象的属性 Merge 到另外一个对象
- src/common/channel.js 控制事件调用
- src/common/exec/proxy.js 用于 Plugin 中往已经有的模块上添加方法
- src/common/init.js 初期处理
- src/common/modulemapper.js 把定义的模块 clobber 到一个对象，在初期化的时候会赋给window
- src/common/pluginloader.js 加载所有 cordova_plugins.js 中定义的模块，执行完成后会触发 onPluginsReady
- src/common/urlutil.js 获取绝对 URL，InAppBrowser 中会用到
- src/common/utils.js 工具类

核心：

- src/cordova.js 事件的处理和回调，外部访问 cordova.js 的入口
- src/scripts/require.js 模块化系统
- src/scripts/bootstrap.js 启动处理（只调用了初期处理 require('cordova/init');），注意和 platform 的 bootstrap 处理不一样

### cordova-android

- src/android/android/nativeapiprovider.js JS->Native 的具体交互形式
- src/android/android/promptbasednativeapi.js 通过 prompt()和 Native 交互（Android2.3 simulator 的 Bug）
- src/android/exec.js 执行 JS<->Native 交互
- src/android/platform.js bootstrap 处理
- src/android/plugin/android/app.js 清缓存、loadUrl、退出程序等

### cordova-ios

- src/ios/exec.js 执行JS<->Native交互
- src/ios/platform.js bootstrap处理
- src/ios/ios/console.js 实现console polyfill
- src/ios/ios/logger.js 实现console polyfill

## 源码部分

dist - 存放带有中文注释的合并后的代码

sourcecode - 存放中文注释后的源码