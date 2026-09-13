import test, { after } from "node:test";
import assert from "node:assert/strict";

import config from "../utils/config.js";
import SubscribeApp from "../apps/subscribe.js";
import QueryApp from "../apps/query.js";
import ChartApp from "../apps/chart.js";
import ExportApp from "../apps/export.js";
import ListApp from "../apps/list.js";
import HelpApp from "../apps/help.js";
import DebugApp from "../apps/debug.js";

// 配置单例会启动文件监听，测试结束后需关闭，否则进程不会退出
after(() => {
  config.destroy();
});

const cases = [
  {
    App: SubscribeApp,
    expects: {
      subscribe: ["#B站粉丝订阅 12345", "#订阅粉丝 12345", "#关注B站粉丝 12345"],
      unsubscribe: [
        "#取消粉丝订阅 12345",
        "#取消订阅 12345",
        "#退订B站粉丝 12345",
        "#退订粉丝 12345",
      ],
    },
  },
  {
    App: ListApp,
    expects: {
      showList: ["#B站订阅列表", "#订阅列表"],
    },
  },
  {
    App: QueryApp,
    expects: {
      query: ["#查B站粉丝数 12345", "#B站粉丝数 12345", "#粉丝数 12345"],
    },
  },
  {
    App: ChartApp,
    expects: {
      showChart: ["#B站粉丝曲线 12345 30", "#粉丝曲线 12345", "#B站粉丝历史曲线 12345"],
    },
  },
  {
    App: ExportApp,
    expects: {
      exportHistory: ["#导出B站粉丝历史 12345", "#下载粉丝历史 12345"],
    },
  },
  {
    App: HelpApp,
    expects: {
      showHelp: ["#B站粉丝数帮助", "#帮助"],
    },
  },
  {
    App: DebugApp,
    expects: {
      showDebug: ["#B站调试配置"],
    },
  },
];

for (const { App, expects } of cases) {
  const instance = new App();

  test(`${instance.name} 规则正则可编译`, () => {
    assert.ok(Array.isArray(instance.rule) && instance.rule.length > 0);
    for (const rule of instance.rule) {
      assert.doesNotThrow(() => new RegExp(rule.reg));
    }
  });

  for (const [fnc, samples] of Object.entries(expects)) {
    test(`${instance.name}.${fnc} 匹配示例命令`, () => {
      const rule = instance.rule.find((r) => r.fnc === fnc);
      assert.ok(rule, `缺少 fnc=${fnc} 的规则`);
      const reg = new RegExp(rule.reg);
      for (const sample of samples) {
        assert.ok(reg.test(sample), `${sample} 未被 ${fnc} 匹配`);
      }
    });
  }
}
