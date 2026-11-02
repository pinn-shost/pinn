<p align="center">
  <img src=".github/assets/banner.png" alt="pinn. – 运行在你自己 NAS 上的家庭管理工具" width="880">
</p>

<p align="center">
  <a href="https://github.com/pinn-shost/pinn/releases/latest"><img src="https://img.shields.io/github/v/release/pinn-shost/pinn?style=flat-square&color=2F4B41&label=release" alt="Latest release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/pinn-shost/pinn?style=flat-square&color=2F4B41" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/runs%20on-Docker-2F4B41?style=flat-square&logo=docker&logoColor=white" alt="Runs on Docker">
  <img src="https://img.shields.io/badge/backend-PocketBase-2F4B41?style=flat-square" alt="PocketBase">
  <img src="https://img.shields.io/badge/iPhone%20%7C%20iPad%20%7C%20Android-installable%20web%20app-2F4B41?style=flat-square" alt="iPhone, iPad and Android">
  <a href="https://ko-fi.com/pinnapp"><img src="https://img.shields.io/badge/Ko--fi-support-C28A33?style=flat-square&logo=kofi&logoColor=white" alt="Support on Ko-fi"></a>
</p>

<p align="center">
  <a href="README.md">🇬🇧 English</a> ·
  <a href="README.de.md">🇩🇪 Deutsch</a> ·
  <a href="README.es.md">🇪🇸 Español</a> ·
  <a href="README.fr.md">🇫🇷 Français</a> ·
  <a href="README.it.md">🇮🇹 Italiano</a> ·
  <a href="README.pt.md">🇧🇷 Português</a> ·
  <b>🇨🇳 中文</b> ·
  <a href="README.ja.md">🇯🇵 日本語</a> ·
  <a href="README.ko.md">🇰🇷 한국어</a> ·
  <a href="README.ru.md">🇷🇺 Русский</a>
</p>

<p align="center">
  <a href="#screenshots">截图</a> ·
  <a href="#what-pinn-does">功能</a> ·
  <a href="#installation">安装</a> ·
  <a href="#privacy">隐私</a> ·
  <a href="#faq">常见问题</a>
</p>

---

pinn. 是一个管理家庭日常的应用：共享日历、本周餐食、购物清单、谁来倒垃圾、零花钱，以及三月要退掉的保险。它通过 Docker 运行在**你自己的 NAS** 上，可以像原生应用一样安装在家人的每台 iPhone、iPad 和 Android 手机上。

没有云账户。没有订阅。没有广告，没有跟踪。你家的数据永远不会离开你的家。

<a id="screenshots"></a>

## 截图

### 在 iPad 上

挂在墙上或放在厨房餐桌上：共享的 iPad 让全家人的信息一目了然。

<table>
  <tr>
    <td align="center" width="50%">
      <a href=".github/assets/screenshots/dashboard.png"><img src=".github/assets/screenshots/dashboard.png" alt="pinn. 仪表板：可选择的家庭成员档案" width="400"></a><br>
      <sub><b>仪表板</b>：每个人点击自己的头像，可选 PIN 码</sub>
    </td>
    <td align="center" width="50%">
      <a href=".github/assets/screenshots/ipad-overview.png"><img src=".github/assets/screenshots/ipad-overview.png" alt="iPad 上的 pinn. 概览，含天气、日历、任务和家庭磁贴" width="400"></a><br>
      <sub><b>概览</b>：天气、日程、任务、餐食和家人一目了然</sub>
    </td>
  </tr>
</table>

### 在手机上

随身携带：pinn. 可以像原生应用一样安装在每台 iPhone 和 Android 手机上。

<table>
  <tr>
    <td align="center" width="33%"><a href=".github/assets/screenshots/home.png"><img src=".github/assets/screenshots/home.png" alt="含今日天气、任务和日程的主页" width="240"></a><br><sub><b>概览</b>：你的一天一目了然</sub></td>
    <td align="center" width="33%"><a href=".github/assets/screenshots/calendar.png"><img src=".github/assets/screenshots/calendar.png" alt="周视图的家庭日历" width="240"></a><br><sub><b>日历</b>：iCloud 和 Google 合在一个视图</sub></td>
    <td align="center" width="33%"><a href=".github/assets/screenshots/meals.png"><img src=".github/assets/screenshots/meals.png" alt="含食谱的每周餐食计划" width="240"></a><br><sub><b>餐食</b>：规划一周，一键购物</sub></td>
  </tr>
  <tr>
    <td align="center" width="33%"><a href=".github/assets/screenshots/lists.png"><img src=".github/assets/screenshots/lists.png" alt="按商店整理的购物清单" width="240"></a><br><sub><b>清单</b>：购物、储备、打包</sub></td>
    <td align="center" width="33%"><a href=".github/assets/screenshots/finance.png"><img src=".github/assets/screenshots/finance.png" alt="按类别显示支出的预算概览" width="240"></a><br><sub><b>财务</b>：预算、储蓄、零花钱</sub></td>
    <td align="center" width="33%"><a href=".github/assets/screenshots/kids.png"><img src=".github/assets/screenshots/kids.png" alt="含每日作息的儿童页面" width="240"></a><br><sub><b>儿童</b>：有趣的每日作息</sub></td>
  </tr>
</table>

### 更多界面

点击任意图片可查看大图。

<details>
<summary><b>显示更多截图</b></summary>

<br>

<table>
  <tr>
    <td align="center" width="25%"><a href=".github/assets/screenshots/house.png"><img src=".github/assets/screenshots/house.png" alt="住宅页面：房屋、每月费用、贷款和购买信息" width="200"></a><br><sub><b>住宅</b> – 房屋、费用、贷款、缺陷和读表集中管理</sub></td>
    <td align="center" width="25%"><a href=".github/assets/screenshots/tasks.png"><img src=".github/assets/screenshots/tasks.png" alt="带有车辆自动提醒的任务列表" width="200"></a><br><sub><b>任务</b> – 自动提醒，例如车检和换轮胎，带快捷按钮</sub></td>
    <td align="center" width="25%"><a href=".github/assets/screenshots/vehicles.png"><img src=".github/assets/screenshots/vehicles.png" alt="车辆页面：车牌、提醒和事件" width="200"></a><br><sub><b>车辆</b> – 车检、轮胎、加油和充电</sub></td>
    <td align="center" width="25%"><a href=".github/assets/screenshots/scan_pantry.png"><img src=".github/assets/screenshots/scan_pantry.png" alt="储物条形码扫描：名称、分类、存放位置和保质期" width="200"></a><br><sub><b>扫描储物</b> – 扫描条形码，入库或用完</sub></td>
  </tr>
  <tr>
    <td align="center" width="25%"><a href=".github/assets/screenshots/weekly_summary_1.png"><img src=".github/assets/screenshots/weekly_summary_1.png" alt="每周预览：天气和未完成的任务" width="200"></a><br><sub><b>每周预览</b> – 天气和尚未完成的事项</sub></td>
    <td align="center" width="25%"><a href=".github/assets/screenshots/weekly_summary_2.png"><img src=".github/assets/screenshots/weekly_summary_2.png" alt="每周预览：逐日显示清洁、垃圾日和付款" width="200"></a><br><sub><b>每周预览</b> – 逐日查看：清洁、垃圾、付款</sub></td>
    <td align="center" width="25%"><a href=".github/assets/screenshots/weekly_summary_3.png"><img src=".github/assets/screenshots/weekly_summary_3.png" alt="上周回顾：含日历和任务的快捷入口" width="200"></a><br><sub><b>上周回顾</b> – 日程、餐食、支出——以及快捷入口</sub></td>
  </tr>
</table>

</details>

<sub>📁 <a href=".github/assets/screenshots">所有图片都在这个文件夹里</a></sub>

<a id="what-pinn-does"></a>

## pinn. 能做什么

| | |
|---|---|
| 📅 **日历** | 每人可使用 iCloud 和 Google 日历，可设为私人或与家人共享。公共假日、学校假期、垃圾回收日期和通讯录中的生日会自动显示。 |
| 🍝 **餐食与食谱** | 规划一周餐食，然后把食材直接发送到购物清单。可从文字、PDF、照片或链接导入食谱，还可选用 AI。与服务器上的其他家庭分享喜爱的食谱。 |
| 🛒 **清单** | 按商店分类的购物清单、库存不足时自动补充清单的储备柜、基于模板的打包清单（度假、待产包、派对），以及礼物和心愿清单。 |
| ✅ **任务与家务** | 带推送提醒的任务、清洁计划和垃圾桶——还有带动画作息的儿童页面，只显示符合当前时段的内容。 |
| 💶 **财务** | 共享或私人资金、家庭预算、储蓄以及含 ETF 和股票的证券账户、零花钱、定期付款和带解约提醒的合同。合租者可以分摊费用并查看谁欠谁多少。 |
| 📄 **文档与车辆** | 收据和保修、带到期提醒的证件。汽车和自行车的检验日期、换胎、油耗和总费用。 |
| 🏡 **住所** | 面向租客、业主和房东：租赁或购买合同、贷款、带照片的缺陷、发票、翻新计划、带预测的表读数、钥匙，以及出租的公寓、房屋和车库的租金收入。花园与植物，浇水计划知道什么时候下过雨。 |
| 📍 **家庭与位置** | 直接在 pinn. 中共享位置——一次性或在选定时间内——也可通过免费的 Traccar Client 应用在后台共享（直接发送到 pinn.，无需额外服务器）。还有“回家路上”模式、含位置和紧急号码的 SOS 警报、急救卡以及地点到达通知。 |
| 🎒 **学校与托儿所** | 每个孩子：课程表（输入或拍照——AI 自动填写）、接送、儿童页面上的作业、带截止日期并可转为提醒的家长通知，以及直接显示在日历中的停课日。 |
| 🐾 **宠物** | 为狗、猫、兔子等建立档案，含可勾选的喂食时间、遛狗、“轮到谁了”的轮值表、带推送提醒的疫苗和驱虫、体重曲线、兽医和急诊兽医、可分享的宠物保姆资料页、可打印的“寻宠”海报，以及喂食器补充提醒。 |
| 🌦️ **天气与假期** | 点按天气（手机上是一个磁贴，iPad 和电脑上位于日期和时间旁边的顶部），查看 14 天及每天的详情。带目的地和日期的打包清单会显示假期天气——预报或典型值——并建议带什么。 |
| 🏠 **智能家居** | 从任务启动 Apple 快捷指令或 Home Assistant 动作——家务到期时扫地机器人清扫厨房，割草机器人和浇水按花园计划运行，喂食器快空时会提醒。 |
| 🎙️ **语音控制** | “嘿 Siri，pinn”：添加到购物清单、朗读清单、创建任务并听取今天的安排——Android 上也可使用。 |
| 🔔 **通知** | iPhone、iPad 和 Android 上的个人推送消息，以及汇总家庭中每项变动的通知铃。 |
| 🧩 **其他功能** | 带可移动便签的家庭公告板、全局搜索、带自动同步的离线模式、深色模式、带个人 PIN 的 iPad 仪表板、访客账户、儿童锁。 |

pinn. 支持 **🇬🇧 English、🇩🇪 Deutsch、🇪🇸 Español、🇫🇷 Français、🇮🇹 Italiano、🇧🇷 Português、🇨🇳 中文、🇯🇵 日本語、🇰🇷 한국어和 🇷🇺 Русский**，会根据你所在的地区调整货币和紧急号码，并可在**家庭**和**合租**两种用语之间切换。一台服务器可以托管多个家庭，每个家庭有各自的管理员。

## 1.123.6 新功能

**荷兰语——第七阶段**

- **pinn. 的荷兰语版本又多了一部分。** 住所（租房、自有住房和出租、含向房东发送缺陷通知的缺陷管理、可拍照抄表并带预测的表计、固定费用与贷款、装修与项目、维护计划、带园艺年历的花园与植物、钥匙）现已翻译（6722 条文本中的 5157 条）。
- 荷兰语在全部翻译完成之前仍然**隐藏**（可在一台设备上解锁试用；尚未翻译的文本会以英语显示）。对其他人没有任何可见变化。
- 更改：`index.html`、`js/sprachen.js`、`js/versionslog.js`、`i18n/nl.i18n.js`、`i18n/versionslog.en.js` 以及所有 README。安装方式不变（`sudo sh pinn-*/pinn-setup.sh` 或更新按钮）。


## 1.123.5 新功能

**荷兰语——第六阶段**

- **pinn. 的荷兰语版本又多了一部分。** 家庭（急救卡、实时位置、“我在回家的路上”、地图和地点）、家庭成员、儿童页面、星星和奖励、宠物（含预防、遛弯和宠物保姆信息）、学校和托儿所（课程表、作业、家长通知、停课日）、定位（地点、商店、Traccar、GPS 追踪器）、SOS 以及“你在哪？”现已翻译（6722 条文本中的 4507 条）。
- 荷兰语在全部翻译完成之前仍然**隐藏**（可在一台设备上解锁试用；尚未翻译的文本会以英语显示）。对其他人没有任何可见变化。
- 更改：`index.html`、`js/sprachen.js`、`js/versionslog.js`、`i18n/nl.i18n.js`、`i18n/versionslog.en.js` 以及所有 README。安装方式不变（`sudo sh pinn-*/pinn-setup.sh` 或更新按钮）。


## 1.123.4 新功能

**荷兰语——第五阶段**

- **pinn. 的荷兰语版本又多了一部分。** 财务（预算、类别、定期交易、零花钱、导出）、资金池（含分摊支出和结算）、证券账户（含导入、储蓄计划和储蓄目标）、合同（含解约信和期限）以及每周和每月展望现已翻译（6722 条文本中的 3614 条）。
- 荷兰语在全部翻译完成之前仍然**隐藏**（可在一台设备上解锁试用；尚未翻译的文本会以英语显示）。对其他人没有任何可见变化。
- 更改：`index.html`、`js/sprachen.js`、`js/versionslog.js`、`i18n/nl.i18n.js`、`i18n/versionslog.en.js` 以及所有 README。安装方式不变（`sudo sh pinn-*/pinn-setup.sh` 或更新按钮）。


## 1.123.3 新功能

**荷兰语——第四阶段**

- **pinn. 的荷兰语版本又多了一部分。** 清单（打包、礼物、心愿、检查清单和创意，含所有模板）、购物（购物清单、完成购物、特别清单、主要商店）、食品储备（含扫码和“我能做什么菜？”）以及食谱（含导入、公开食谱和回收站）现已翻译（6722 条文本中的 2656 条）。
- 荷兰语在全部翻译完成之前仍然**隐藏**（可在一台设备上解锁试用；尚未翻译的文本会以英语显示）。对其他人没有任何可见变化。
- 更改：`index.html`、`js/sprachen.js`、`js/versionslog.js`、`i18n/nl.i18n.js`、`i18n/versionslog.en.js` 以及所有 README。安装方式不变（`sudo sh pinn-*/pinn-setup.sh` 或更新按钮）。

## 1.123.2 新功能

**荷兰语——第三阶段**

- **pinn. 的荷兰语版本又多了一部分。** 日历（日程、日历账户、公共假日、学校假期、垃圾收集）、膳食计划、任务、家务、概览（家庭卡片、生日）、天气和搜索现已翻译（6722 条文本中的 1545 条）。
- 荷兰语在全部翻译完成之前仍然**隐藏**（可在一台设备上解锁试用；尚未翻译的文本会以英语显示）。对其他人没有任何可见变化。
- 更改：`index.html`、`js/sprachen.js`、`js/versionslog.js`、`i18n/nl.i18n.js`、`i18n/versionslog.en.js` 以及所有 README。安装方式不变（`sudo sh pinn-*/pinn-setup.sh` 或更新按钮）。

## 1.123.1 新功能

**荷兰语 – 第二阶段**

- **更多 pinn. 内容有了荷兰语。** 账户（个人资料、PIN、仪表盘设备、访客、通知）、设备与登录、错误日志以及备份与更新现已翻译（6722 条文本中的 874 条）。
- 在全部翻译完成之前，荷兰语保持**隐藏**（可在一台设备上解锁试用；尚缺的文本会显示为英文）。对其他人没有任何可见变化。
- 已更改：`index.html`, `js/sprachen.js`, `js/versionslog.js`, `i18n/nl.i18n.js`, `i18n/versionslog.en.js` 以及所有 README。安装方式不变（`sudo sh pinn-*/pinn-setup.sh` 或更新按钮）。

## 1.123.0 新功能

**荷兰语 – 第一阶段**

- **荷兰语即将到来。** pinn. 正在逐步翻译成荷兰语。先从登录、仪表盘、菜单、主管理员页面和所有设置开始（6722 条文本中的 504 条）。
- 在全部翻译完成之前，荷兰语保持**隐藏**（可在一台设备上解锁试用；尚缺的文本会显示为英文）。对其他人没有任何可见变化。
- 已更改：`index.html`, `js/sprachen.js`, `js/textkern.js`, `js/versionslog.js`, `i18n/nl.i18n.js`, `i18n/versionslog.en.js`, `pb_hooks/pinn-textkern.js`, `.github/scripts/i18n-keys.js` 以及所有 README。安装方式不变（`sudo sh pinn-*/pinn-setup.sh` 或更新按钮）。

## 工作原理

```mermaid
flowchart LR
  subgraph Home["你的家庭网络"]
    direction LR
    P["📱 Phones & tablets<br/>pinn. on the home screen"] -->|HTTPS| C["Caddy<br/>certificate via DuckDNS"]
    C --> PB["PocketBase<br/>pinn. app + database"]
    PB --- T["Traccar<br/>optional, GPS trackers"]
    PB --- HA["Home Assistant<br/>optional"]
    PB --- B["Nightly backup"]
  end
  R["📱 On the go"] -.->|"WireGuard or Tailscale VPN"| C
```

所有组件都以 Docker 容器的形式运行在同一台机器上。HTTPS **无需端口转发**——证书通过 DNS 验证签发。从外部只能通过你自己的 VPN 访问 pinn.。

## 系统要求

- 装有 **Docker** 和 **Docker Compose 2.17+** 的 NAS 或服务器——在搭载 UGOS 的 UGREEN NAS 上开发，可在任何 Linux Docker 主机上运行（amd64、arm64、armv7）
- 对它的 SSH 访问权限
- 可选但推荐：一个免费的 [DuckDNS](https://www.duckdns.org) 子域名用于 HTTPS——推送通知和把 pinn. 安装为应用都需要它

<a id="installation"></a>

## 安装

1. 下载[最新版本](https://github.com/pinn-shost/pinn/releases/latest)的 ZIP 并解压。
2. 在 NAS 上创建一个文件夹，例如 `/volume1/docker/Pocketbase`，把解压后的文件夹（例如 `pinn-1.123.6` 或 `pinn-main`）原样放进去。
3. 通过 SSH 登录并运行：
   ```sh
   cd /volume1/docker/Pocketbase && sudo sh pinn-*/pinn-setup.sh
   ```
   脚本会把每个文件复制到位，下载 PDF 导入和照片文字识别所需的库，并启动 pinn.。
4. 打开 `http://<NAS-IP>:8090` → **以主管理员身份登录** → 密码 `Admin` → 设置你自己的密码。
5. **设置向导**会带你完成其余步骤——HTTPS、通过 WireGuard 或 Tailscale 远程访问、Google、AI、位置和 Home Assistant——一步一步，支持十种语言。
6. 在每部手机上通过 HTTPS 地址打开 pinn.，并添加到主屏幕：
   - **iPhone/iPad（Safari）：** 分享 → *添加到主屏幕*（通知需要 iOS 16.4 或更高版本）
   - **Android（Chrome）：** 设置 → 通知 → *将 pinn. 安装为应用*，或 Chrome 菜单 ⋮ → *安装应用*

   然后在每台设备上通过**设置 → 通知 → 在此设备上启用**打开通知。

**更新：**下载新的 ZIP，把解压后的文件夹放进同一个文件夹，再次运行 `sudo sh pinn-*/pinn-setup.sh`。被替换的文件会保留在 `_alt/` 中，你的数据不会被改动。

**备份**每晚运行并保存到 `./backups`，保留 14 天。

<a id="privacy"></a>

## 隐私

pinn. 为那些你绝不会交给云服务的数据而生：银行对账单、健康文件、孩子所在的位置。因此：

- **所有数据都保存在你的 NAS 上**，存放在单个 PocketBase 数据库中。没有 pinn. 服务器，也没有遥测。
- **没有来自第三方服务器的脚本。**所有代码和库都由你的 NAS 提供。
- **推送通知不含内容。**Apple、Google 和 Mozilla 只传递一个空的唤醒信号；设备随后从你的 NAS 获取消息。
- **iCloud 和 Google 的密码**加密存放在受保护的集合中。
- **无法从互联网访问。**远程访问通过你自己的 VPN。

只有需要外部服务的功能，pinn. 才会联系外部服务：

| 服务 | 用途 | 何时 |
|---|---|---|
| [Open-Meteo](https://open-meteo.com) | 天气预报 | 设置了家庭地址时 |
| [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org) | 把地址转换为地图位置 | 输入地址时 |
| [OpenStreetMap 瓦片](https://www.openstreetmap.org) | 地图背景 | 在位置页面，通过你的 NAS 加载 |
| [Google Fonts](https://fonts.google.com) | 字体 | 应用加载时 |
| [OpenHolidays API](https://www.openholidaysapi.org) | 公共假日和学校假期 | 设置了家庭地址时 |
| [DuckDNS](https://www.duckdns.org) | HTTPS 证书和地址 | 如已配置 |
| iCloud / Google | 日历和联系人 | 仅限你连接的账户 |
| Google Gemini | 读取食谱和文档 | 仅在你添加 API 密钥时 |
| jsDelivr | 一次性下载 pdf.js 和 Tesseract | 仅在安装期间 |

<a id="faq"></a>

## 常见问题

<details>
<summary><b>我需要在路由器上开放端口吗？</b></summary>
<br>
不需要。HTTPS 证书通过 DNS 验证签发，远程访问通过 VPN——FRITZ!Box 上用 WireGuard，其他路由器用 Tailscale。
</details>

<details>
<summary><b>没有 NAS 也能用吗？</b></summary>
<br>
任何长期开机并装有 Docker 的设备都可以：迷你电脑、Raspberry Pi 4/5 或 Linux 服务器。
</details>

<details>
<summary><b>pinn. 是 App Store 里的“正式”应用吗？</b></summary>
<br>
pinn. 是一个添加到主屏幕的网页应用。之后它像原生应用一样全屏打开，支持离线使用，显示未完成任务的角标，并接收推送通知——完全不需要应用商店。
</details>

<details>
<summary><b>多个家庭可以共用一个安装吗？</b></summary>
<br>
可以。主管理员创建家庭，每个家庭有自己的管理员、日历和数据。食谱可以选择在家庭之间共享。
</details>

<details>
<summary><b>孩子怎么办？</b></summary>
<br>
开启儿童锁的档案只能看到自己的任务，无法删除或更改任何内容。财务、文档和车辆保持隐藏。年幼的孩子有自己的趣味页面，里面是每日作息。
</details>

<details>
<summary><b>费用是多少？</b></summary>
<br>
免费——pinn. 是基于 MIT 许可证的免费开源软件。Gemini AI 等可选服务有免费额度。
</details>

## 仓库结构

仓库的结构与 NAS 上的安装完全相同——每个文件都放在最终所在的位置：

```
pinn/
├── pb_hooks/            server: *.pb.js hooks and their helper modules (pinn-*.js, calendar-sync.js)
├── pb_public/           web app served by PocketBase
│   ├── index.html       the app page, built from src/ (HTML, start check) – do not edit by hand
│   ├── js/              app code split out of index.html, plain <script> files without a build step
│   │                    (ruhemodus.js, textkern.js, sprachen.js, region.js, grundlagen.js, popups.js, verbindung.js, benutzer.js, mitteilungen.js, serverzugriff.js, tastatur.js, anmeldemaske.js, dashboard.js, dashboardhintergrund.js, profilauswahl.js, pineingabe.js, dashboardsitzung.js, dashboardkonto.js, familienverwalten.js, einrichten.js, exportieren.js, hauptadminseite.js, anmeldung.js, konto.js, profilverwaltung.js, zustand.js, bedienzustand.js, rezeptbilder.js, zusammenfuehren.js, speichern.js, design.js, sprache.js, uebersicht.js, familienkachel.js, wobistdu.js, geburtstagsfeier.js, wetterkachel.js, geburtstage.js, uebersichteinstellungen.js, familiensync.js, bereiche.js, kalenderquellen.js, icsparser.js, zeitleiste.js, termindetails.js, kalenderdatei.js, wetter.js, wohnort.js, feiertage.js, muellkalender.js, mitglieder.js, profilbild.js, mitglied.js, kinderseite.js, kinderroutine.js, sterne.js, kalenderansicht.js, essenplanen.js, rezeptparser.js, rezeptdialog.js, rezeptbild.js, rezeptmengen.js, einkauf.js, einkaufslisten.js, einkaufseingabe.js, rezepte.js, offline.js, aufgabenextras.js, appbadge.js, reisen.js, aufgabendaten.js, haushalt.js, reihum.js, aufgaben.js, smarthome.js, sprachsteuerung.js, termine.js, ansichten.js, versionspruefung.js, sicherungen.js, geraete.js, fehlerprotokoll.js, versionslog.js, einstellungen.js, kalenderkonto.js, finanzen.js, kassen.js, vorrat.js, vorrat2.js, sparen.js, vertraege.js, fahrzeuge.js, zuhause.js, dokumente.js, pdflesen.js, appstart.js, pinnwand.js, listen.js, familie.js, hinweise.js, ausblick.js – ausblick.js always comes last)
│   ├── css/             app styles split out of index.html, plain CSS without a build step (ergaenzung.css, energiesparen.css, basis.css … haustierewetter.css, terminal.css, glocke.css)
│   ├── einrichtung.js   setup assistant · datenexport.js  data export
│   ├── i18n/            texts by key (de, en, fr, es, it, pt, zh, ja, ko) – English is the reference
│   └── vendor/          pinn.css, pocketbase/ (pdf.js and Tesseract are downloaded by the setup)
├── .github/             GitHub Actions (workflows/check.yml), checks (scripts/), CONTRIBUTING.md, SECURITY.md, images – not installed
├── src/                 sources of index.html (build.js, rahmen.html, teile/) – not installed
├── caddy/Caddyfile      HTTPS reverse proxy
├── docker-compose.yaml  all containers
├── env.txt              template for .env
├── pinn-setup.sh        install & update
├── pinn-wartung.sh      backups & updates (container "wartung")
├── pinn-pocketbase-update.sh
├── index.html           placeholder only, never installed (keeps the update button of 1.38 working)
└── README.md            this page · README.<code>.md in de, es, fr, it, pt, zh, ja, ko
```

`pinn-setup.sh` 会把 `pb_hooks/`、`pb_public/` 和 `caddy/Caddyfile` 原样复制到项目文件夹；数据文件夹（`pb_data/`、`konfig/`、`backups/`、`caddy/data/` …）绝不会被改动。

## 参与贡献

非常欢迎错误报告、想法和翻译——请参阅 [CONTRIBUTING.md](.github/CONTRIBUTING.md)。请按 [SECURITY.md](.github/SECURITY.md) 中的说明私下报告安全问题。提交 Pull Request 前，请运行 `node .github/scripts/check-all.js`——相同的检查也会在 GitHub 上自动运行。

## 支持 pinn.

pinn. 是免费的，并将一直免费——完全免费，面向所有人。它是我在业余时间做的。如果它让你的日常生活轻松了一点，非常欢迎你给予一点小小的支持，但完全出于自愿：

<p>
  <a href="https://ko-fi.com/pinnapp"><img src="https://img.shields.io/badge/Ko--fi-Buy%20me%20a%20coffee-C28A33?style=for-the-badge&logo=kofi&logoColor=white" alt="Ko-fi"></a>
  <a href="https://buymeacoffee.com/pinn"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-support-2F4B41?style=for-the-badge&logo=buymeacoffee&logoColor=white" alt="Buy Me a Coffee"></a>
</p>

一个 ⭐ 也有帮助——让其他家庭更容易找到 pinn.。

## 使用的开源项目

[PocketBase](https://pocketbase.io) (MIT) · [Tailwind CSS](https://tailwindcss.com) (MIT) · [pdf.js](https://mozilla.github.io/pdf.js/) (Apache-2.0) · [Tesseract.js](https://tesseract.projectnaptha.com) (Apache-2.0) · [Traccar](https://www.traccar.org) (Apache-2.0) · [Caddy](https://caddyserver.com) (Apache-2.0)

## 许可证

[MIT](LICENSE)——随意使用、修改和分享。
