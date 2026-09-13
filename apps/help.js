import { Plugin, guardPluginHandler } from "../utils/host.js";

class HelpApp extends Plugin {
  constructor() {
    const rules = [
      {
        reg: "^#(?:(?:[bB]\\s*站|[bB]ilibili|[bB]ili|哔站|小破站)?\\s*粉丝数|\\s*粉丝)?\\s*(?:帮助|菜单|指南|手册|[hH][eE][lL][pP]|\\?|？)$",
        fnc: "showHelp",
        permission: "all",
      },
    ];

    super({
      name: "BilibiliFansTracker-Help",
      dsc: "B站粉丝数帮助",
      rule: rules,
    });
  }

  async showHelp() {
    return guardPluginHandler(this, this._showHelp);
  }

  async _showHelp() {
    const helpText = [
      "📊 B站粉丝数追踪 使用帮助",
      "",
      "🔹 订阅管理（仅群聊）",
      "#B站粉丝订阅 [UID/用户名]    - 订阅UP主粉丝数追踪",
      "#取消粉丝订阅 [UID/用户名]   - 取消订阅",
      "#B站订阅列表                - 查看本群订阅列表",
      "",
      "🔹 查询",
      "#查B站粉丝数 [UID/用户名]    - 查询粉丝数及历史曲线",
      "",
      "🔹 图表",
      "#B站粉丝曲线 [UID/用户名]      - 查看粉丝变化曲线（默认30天）",
      "#B站粉丝曲线 [UID/用户名] 7    - 近7天曲线",
      "#B站粉丝曲线 [UID/用户名] 30   - 近30天曲线",
      "#B站粉丝曲线 [UID/用户名] 90   - 近90天曲线",
      "#B站粉丝曲线 [UID/用户名] 365  - 近365天曲线",
      "",
      "🔹 导出（建议私聊）",
      "#导出B站粉丝历史 [UID/用户名] - 导出CSV历史数据",
      "",
      "🔹 调试（仅主人）",
      "#B站调试配置                - 查看当前配置与订阅统计",
      "",
      "🔹 帮助",
      "#B站粉丝数帮助              - 显示此帮助",
      "",
      "📌 说明",
      "· 订阅功能仅限群聊使用",
      "· 订阅需群主/管理员权限（QQ官方Bot仅主人）",
      "· 查询、图表命令所有人可用",
      "· 导出建议私聊机器人执行",
      "· 图表范围支持 7/30/90/180/365 天",
      "· 每群最多订阅100个UP主",
      "· 支持UID或用户名搜索UP主",
    ].join("\n");

    await this.reply(helpText);
  }
}

export { HelpApp as default };
