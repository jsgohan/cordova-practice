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

## Cordova mutate

为什么会有mutate方案？

原因：在接入cordova之前，我们已经实现了属于我们自己的jssdk和原生能力壳，但是因为cordova已经是一个很成型的混合开发方案，我们希望可以借鉴他们的实现方式来扩展我们的实现。并且我们原来的实现方式是结合jenkins将整个打包的过程都用jenkins脚本实现自动化打包，这样对于我们开发人员来说就不需要在自己的本机同时安装ios和andriod两套环境，并且也节省了部门的开支，毕竟要开发ios要给开发人员配置一台mac！

经过两天的阅读源码，我们初定采用的方案，最大程度的使用cordova的插件能力，同时兼容我们自己的原生能力，结合Jenkins实现自己的打包机制。

原生层

1. 继承cordova的webview

   - android端替换cordova的原生webview为X5Webview

   - ios端替换cordova的原生webview为WKWebview

     替换的原因就是我们自己的原生壳使用的就是这两个webview

2. 插件方面：将插件带的plugin.xml中的platform中的配置信息及文件引入我们原生壳的指定目录下

⚠️ios端有个坑，项目的project.pbxproj中的信息存放的项目中各项配置的信息，且包括引入了哪些源码，对于开发人员来说，其实是不用关注这点的，这么做的目的是什么不太清楚，没有具体详问。。。这个文件里的信息是怎么生成的xcode其实已经帮忙处理好了，cordova也自然的把这些事情也做好了。我们现在要用我们自己的打包方式，就必须也把这个给嚼了，因为对于整个流程来说，这点是最大的问题。。

Web端

1. 引入cordova.js及cordova-plugins相关文件到我们自己的Vue模板中，在cordova-js中增加我们自己的jssdk引用，重新打包cordova.js文件
2. 重写cordova-plugin打包流程，放到我们自己的devtools工具中，生成我们自己的config.json，目的是jenkins脚本会根据配置文件实现打包

Jenkins构建环境端

1. 需要根据上传的源文件中的config.json的规则，配置好原生壳里的文件，生成待打包的源码信息
2. 实现打包生成app

### TODO

1. 先解决前面说的ios的问题，于是需要去分析cordova-cli、cordova-lib中关于platform、plugin部分的源码
2. 实现cordova的plugin功能，生成自己的config.json