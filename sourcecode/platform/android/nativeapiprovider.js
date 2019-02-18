/*
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
*/

/**
 * Exports the ExposedJsApi.java object if available, otherwise exports the PromptBasedNativeApi.
 * Native的具体交互形式
 */

 // WebView中是否通过addJavascriptInterface提供了访问ExposedJsApi.java的_cordovaNative对象
 // 如果不存在选择prompt()形式的交互方式
var nativeApi = this._cordovaNative || require('cordova/android/promptbasednativeapi');
var currentApi = nativeApi;

module.exports = {
    // 获取当前交互方式
    get: function() { return currentApi; },
    // 设置使用prompt()交互方式
    // (true: prompt false: 自动选择)
    setPreferPrompt: function(value) {
        currentApi = value ? require('cordova/android/promptbasednativeapi') : nativeApi;
    },
    // Used only by tests.
    // 直接设置交互方式对象（很少用到）
    set: function(value) {
        currentApi = value;
    }
};
