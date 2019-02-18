/*
 *
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 *
*/

// 模块化系统
// cordova.js中采用的模块化加载fork自almond.js修改实现简易版CommonJS风格的模块系统，同时提供了和node.js之间很好的交互
// 在cordova.js中直接使用define()和require()，在其他文件可以通过cordova.define()和cordova.require()来调用
// 定义2个cordova.js内部使用的全局函数require/define
var require;
var define;

// 通过自调用的匿名函数来实例化全局函数require/define
(function () {
    // 全部模块
    var modules = {};
    // Stack of moduleIds currently being built.
    // 正在build中的模块ID的栈
    var requireStack = [];
    // Map of module ID -> index into requireStack of modules currently being built.
    // 标示正在build中模块ID的Map
    var inProgressModules = {};
    var SEPARATOR = '.';

    // 模块build
    function build (module) {
        // 备份工厂方法
        var factory = module.factory;
        // 对require对象进行特殊处理
        var localRequire = function (id) {
            var resultantId = id;
            // Its a relative path, so lop off the last portion and add the id (minus "./")
            if (id.charAt(0) === '.') {
                resultantId = module.id.slice(0, module.id.lastIndexOf(SEPARATOR)) + SEPARATOR + id.slice(2);
            }
            return require(resultantId);
        };
        // 给模块定义一个空的exports对象，防止工厂类方法中的空引用
        module.exports = {};
        // 删除工厂方法
        delete module.factory;
        // 调用备份的工厂方法(参数必须是require, exports, module)
        factory(localRequire, module.exports, module);
        // 返回工厂方法中实现的module.exports对象
        return module.exports;
    }

    // 加载模块
    require = function (id) {
        // 如果模块不存在抛出异常
        if (!modules[id]) {
            throw 'module ' + id + ' not found';
        // 如果模块正在build中抛出异常
        } else if (id in inProgressModules) {
            var cycle = requireStack.slice(inProgressModules[id]).join('->') + '->' + id;
            throw 'Cycle in require graph: ' + cycle;
        }
        // 如果模块存在工厂方法说明还未进行build(require嵌套)
        if (modules[id].factory) {
            try {
                // 标示该模块正在build
                inProgressModules[id] = requireStack.length;
                // 将该模块压入请求栈
                requireStack.push(id);
                // 模块build，成功后返回module.exports
                return build(modules[id]);
            } finally {
                // build完成后删除当前请求
                delete inProgressModules[id];
                requireStack.pop();
            }
        }
        // build完的模块直接返回module.exports
        return modules[id].exports;
    };

    // 定义模块
    define = function (id, factory) {
        // 如果已经存在抛出异常
        if (modules[id]) {
            throw 'module ' + id + ' already defined';
        }

        // 模块以ID为索引包含ID和工厂方法
        modules[id] = {
            id: id,
            factory: factory
        };
    };

    // 移除模块
    define.remove = function (id) {
        delete modules[id];
    };

    // 返回所有模块
    define.moduleMap = modules;
})();

// Export for use in node
// 如果处于nodejs环境的话，把require/define暴露给外部
if (typeof module === 'object' && typeof require === 'function') {
    module.exports.require = require;
    module.exports.define = define;
}
