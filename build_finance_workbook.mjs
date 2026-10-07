import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "/Users/Zhuanz/Desktop/财务/outputs/01a0ed44-7ece-7381-af92-01211c29a0f5";
const outputPath = `${outputDir}/常州市爱坤网络科技有限公司_记账与报税模板.xlsx`;
const font = "Arial";
const colors = {
  navy: "#17365D",
  blue: "#1F4E78",
  lightBlue: "#D9EAF7",
  paleBlue: "#EAF3F8",
  input: "#FFF2CC",
  green: "#E2F0D9",
  red: "#FCE4D6",
  gray: "#E7E6E6",
  dark: "#222222",
  border: "#B7C9D6",
};

const wb = Workbook.create();
const desk = wb.worksheets.add("工作台");
const invoices = wb.worksheets.add("发票台账");
const bank = wb.worksheets.add("银行流水");
const journal = wb.worksheets.add("记账凭证");
const balances = wb.worksheets.add("科目余额");
const tax = wb.worksheets.add("税务测算");
const calendar = wb.worksheets.add("申报日历");

const sheets = [desk, invoices, bank, journal, balances, tax, calendar];
for (const s of sheets) {
  s.showGridLines = false;
  s.getRange("A1:Q200").format.font = { name: font, size: 10, color: colors.dark };
  s.getRange("A1:Q200").format.verticalAlignment = "center";
}

function title(sheet, text, endCol = "H") {
  sheet.getRange(`A2:${endCol}2`).merge();
  sheet.getRange("A2").values = [[text]];
  sheet.getRange("A2").format.font = { name: font, size: 15, bold: true, color: colors.navy };
  sheet.getRange("A3:" + endCol + "3").format.borders = { bottom: { style: "thin", color: colors.blue } };
  sheet.getRange("A2:" + endCol + "2").format.rowHeight = 24;
}

function header(range) {
  range.format = {
    fill: colors.blue,
    font: { name: font, size: 10, bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
    borders: { preset: "inside", style: "thin", color: "#FFFFFF" },
  };
  range.format.rowHeight = 30;
}

function section(range) {
  range.format = {
    fill: colors.lightBlue,
    font: { name: font, size: 10, bold: true, color: colors.navy },
    borders: { preset: "outside", style: "thin", color: colors.border },
  };
}

function input(range) {
  range.format.fill = colors.input;
  range.format.font = { name: font, size: 10, color: "#0000FF" };
}

function sourceNote(sheet, row, label, url) {
  sheet.getRange(`A${row}:B${row}`).values = [[label, url]];
  sheet.getRange(`A${row}`).format.font = { name: font, size: 9, bold: true, color: colors.navy };
  sheet.getRange(`B${row}`).format.font = { name: font, size: 9, color: "#0563C1", underline: true };
}

// 工作台
title(desk, "常州市爱坤网络科技有限公司 记账与报税工作台", "J");
desk.getRange("A5:B5").merge();
desk.getRange("A5").values = [["基础设置（黄色单元格请核对）"]];
section(desk.getRange("A5:D5"));
desk.getRange("A6:B12").values = [
  ["纳税人类型", "小规模纳税人"],
  ["增值税纳税期限", "按季"],
  ["会计制度", "小企业会计准则"],
  ["账簿年度", 2026],
  ["季度增值税起征点（元）", 300000],
  ["小规模常用征收率", 0.01],
  ["小型微利企业所得税估算率", 0.05],
];
desk.getRange("B6:B12").format.fill = colors.input;
desk.getRange("B6:B12").format.font = { name: font, size: 10, color: "#0000FF" };
desk.getRange("B9:B10").format.numberFormat = "#,##0";
desk.getRange("B11:B12").format.numberFormat = "0.0%";
desk.getRange("B6").dataValidation = { rule: { type: "list", values: ["小规模纳税人", "一般纳税人"] } };
desk.getRange("B7").dataValidation = { rule: { type: "list", values: ["按季", "按月"] } };

desk.getRange("D5:J5").merge();
desk.getRange("D5").values = [["每笔业务的最小证据链"]];
section(desk.getRange("D5:J5"));
desk.getRange("D6:J10").values = [
  ["收入", "合同/报价", "交付记录", "验收单", "销项发票", "对公收款", "记账凭证"],
  ["费用", "业务目的", "订单/合同", "公司抬头发票", "付款证明", "报销单", "记账凭证"],
  ["股东出资", "章程/出资期限", "个人转公司", "备注“投资款”", "银行回单", "公示记录", "记账凭证"],
  ["股东借款", "借款协议", "个人转公司", "备注“借款”", "银行回单", "还款记录", "记账凭证"],
  ["利润分红", "已完税利润", "弥补亏损/提公积", "股东决定", "代扣个税", "公司转个人", "记账凭证"],
];
desk.getRange("D6:D10").format.font = { name: font, size: 10, bold: true, color: colors.navy };
desk.getRange("D6:J10").format.borders = { insideHorizontal: { style: "thin", color: colors.border } };

desk.getRange("A15:J15").merge();
desk.getRange("A15").values = [["本月关账清单"]];
section(desk.getRange("A15:J15"));
desk.getRange("A16:J23").values = [
  ["1", "下载公司银行对账单", "保存PDF/Excel", "", "5", "核对销项、进项发票台账", "票、款、合同对应", "", "", ""],
  ["2", "导出数电票清单和票面文件", "PDF/OFD/XML均留存", "", "6", "编制并检查记账凭证", "每张凭证借贷相等", "", "", ""],
  ["3", "逐笔匹配银行流水", "不得遗漏个人垫付", "", "7", "更新科目余额和往来", "清理应收、股东往来", "", "", ""],
  ["4", "补齐合同、验收、报销单", "缺票先标记不可税前扣除", "", "8", "备份并锁定当月文件夹", "账簿与附件双备份", "", "", ""],
  ["提示", "即使当期无收入，也按电子税务局“应申报清册”做零申报并报送财务报表。", "", "", "", "", "", "", "", ""],
  ["提示", "公司款与个人款严格分开。一人公司的唯一股东对财产独立负更高举证责任。", "", "", "", "", "", "", "", ""],
  ["提示", "税务测算页只作复核，不替代电子税务局申报表及主管税务机关口径。", "", "", "", "", "", "", "", ""],
  ["提示", "如实际为一般纳税人，本模板的增值税测算不适用，应按销项税额减可抵扣进项税额另行核算。", "", "", "", "", "", "", "", ""],
];
desk.getRange("A16:A23").format.font = { name: font, size: 10, bold: true, color: colors.navy };
desk.getRange("B20:J23").format.fill = colors.paleBlue;
desk.getRange("B16:J23").format.wrapText = true;

desk.getRange("A26:J26").merge();
desk.getRange("A26").values = [["政策来源（用于设置本模板；申报前仍以电子税务局当期口径为准）"]];
section(desk.getRange("A26:J26"));
sourceNote(desk, 27, "江苏税务：财务报表原则上按季和年度报送", "https://jiangsu.chinatax.gov.cn/art/2025/12/31/art_16717_362415.html");
sourceNote(desk, 28, "税务总局：2026—2027年小规模季度起征点30万元、3%项目减按1%", "https://fgk.chinatax.gov.cn/zcfgk/c100015/c5247429/content.html");
sourceNote(desk, 29, "税务总局：小型微利企业实际企业所得税负担约5%至2027年底", "https://www.chinatax.gov.cn/chinatax/n810356/n3255681/c5240479/content.html");
sourceNote(desk, 30, "市场监管总局：实缴出资等信息20个工作日内公示", "https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/fgs/art/2024/art_6580c00811be45bfa304c1273b74e294.html");
desk.getRange("A6:A12").format.font = { name: font, size: 10, bold: true, color: colors.dark };
desk.getRange("A1:J35").format.wrapText = false;
desk.getRange("A15:J23").format.wrapText = true;
desk.getRange("A:A").format.columnWidth = 15;
desk.getRange("B:B").format.columnWidth = 27;
desk.getRange("C:C").format.columnWidth = 22;
desk.getRange("D:J").format.columnWidth = 16;
desk.getRange("B27:B30").format.columnWidth = 80;

// 发票台账
title(invoices, "发票台账", "O");
invoices.getRange("A4:O4").values = [["日期", "方向", "发票类型", "项目/合同号", "对方名称", "发票号码", "含税金额", "税率", "不含税金额", "税额", "发票状态", "收付款状态", "凭证号", "附件文件名", "备注"]];
header(invoices.getRange("A4:O4"));
for (let r = 5; r <= 154; r++) {
  invoices.getRange(`I${r}`).formulas = [[`=IF(G${r}="","",G${r}/(1+H${r}))`]];
  invoices.getRange(`J${r}`).formulas = [[`=IF(G${r}="","",G${r}-I${r})`]];
}
input(invoices.getRange("A5:H154"));
input(invoices.getRange("K5:O154"));
invoices.getRange("I5:J154").format.font = { name: font, size: 10, color: "#000000" };
invoices.getRange("A5:A154").format.numberFormat = "yyyy-mm-dd";
invoices.getRange("G5:G154").format.numberFormat = "#,##0.00;[Red](#,##0.00);-";
invoices.getRange("H5:H154").format.numberFormat = "0.0%";
invoices.getRange("I5:J154").format.numberFormat = "#,##0.00;[Red](#,##0.00);-";
invoices.getRange("B5:B154").dataValidation = { rule: { type: "list", values: ["销项", "进项"] } };
invoices.getRange("C5:C154").dataValidation = { rule: { type: "list", values: ["数电普票", "数电专票", "纸票", "收据/其他"] } };
invoices.getRange("H5:H154").dataValidation = { rule: { type: "list", values: [0, 0.01, 0.03, 0.06, 0.13] } };
invoices.getRange("K5:K154").dataValidation = { rule: { type: "list", values: ["正常", "红冲", "作废"] } };
invoices.getRange("L5:L154").dataValidation = { rule: { type: "list", values: ["未收/付", "部分收/付", "已收/付"] } };
invoices.tables.add("A4:O154", true, "InvoicesTable").style = "TableStyleMedium2";
invoices.freezePanes.freezeRows(4);
invoices.getRange("A:A").format.columnWidth = 13;
invoices.getRange("B:C").format.columnWidth = 12;
invoices.getRange("D:F").format.columnWidth = 20;
invoices.getRange("G:J").format.columnWidth = 14;
invoices.getRange("K:M").format.columnWidth = 14;
invoices.getRange("N:O").format.columnWidth = 24;

// 银行流水
title(bank, "银行流水与付款证据", "N");
bank.getRange("A4:N4").values = [["日期", "公司账户", "银行流水号", "方向", "对方名称", "摘要", "金额", "项目/合同号", "业务类型", "发票号码", "凭证号", "已对账", "附件文件名", "备注"]];
header(bank.getRange("A4:N4"));
input(bank.getRange("A5:N154"));
bank.getRange("A5:A154").format.numberFormat = "yyyy-mm-dd";
bank.getRange("G5:G154").format.numberFormat = "#,##0.00;[Red](#,##0.00);-";
bank.getRange("D5:D154").dataValidation = { rule: { type: "list", values: ["收", "支"] } };
bank.getRange("I5:I154").dataValidation = { rule: { type: "list", values: ["客户回款", "供应商付款", "股东出资", "股东借款", "偿还股东借款", "费用报销", "缴税", "分红", "银行费用", "其他"] } };
bank.getRange("L5:L154").dataValidation = { rule: { type: "list", values: ["是", "否"] } };
bank.tables.add("A4:N154", true, "BankTable").style = "TableStyleMedium2";
bank.freezePanes.freezeRows(4);
bank.getRange("A:D").format.columnWidth = 14;
bank.getRange("E:F").format.columnWidth = 22;
bank.getRange("G:L").format.columnWidth = 15;
bank.getRange("M:N").format.columnWidth = 24;

// 记账凭证
title(journal, "记账凭证（复式记账）", "O");
journal.getRange("A4:O4").values = [["凭证日期", "凭证号", "行号", "摘要", "科目编码", "科目名称", "借方", "贷方", "损益类别", "项目/合同号", "对方名称", "发票号码", "银行流水号", "凭证借贷差额", "附件文件名"]];
header(journal.getRange("A4:O4"));
for (let r = 5; r <= 204; r++) {
  journal.getRange(`N${r}`).formulas = [[`=IF(B${r}="","",SUMIFS($G$5:$G$204,$B$5:$B$204,B${r})-SUMIFS($H$5:$H$204,$B$5:$B$204,B${r}))`]];
}
input(journal.getRange("A5:M204"));
input(journal.getRange("O5:O204"));
journal.getRange("N5:N204").format.numberFormat = "#,##0.00;[Red](#,##0.00);-";
journal.getRange("G5:H204").format.numberFormat = "#,##0.00;[Red](#,##0.00);-";
journal.getRange("A5:A204").format.numberFormat = "yyyy-mm-dd";
journal.getRange("I5:I204").dataValidation = { rule: { type: "list", values: ["非损益", "收入", "成本费用", "所得税费用"] } };
journal.getRange("N5:N204").conditionalFormats.add("cellIs", { operator: "notEqual", formula: 0, format: { fill: colors.red, font: { bold: true, color: "#C00000" } } });
journal.tables.add("A4:O204", true, "JournalTable").style = "TableStyleMedium2";
journal.freezePanes.freezeRows(4);
journal.getRange("A:C").format.columnWidth = 13;
journal.getRange("D:D").format.columnWidth = 28;
journal.getRange("E:F").format.columnWidth = 16;
journal.getRange("G:I").format.columnWidth = 15;
journal.getRange("J:M").format.columnWidth = 18;
journal.getRange("N:O").format.columnWidth = 22;

// 科目余额
title(balances, "科目余额（由记账凭证汇总）", "G");
balances.getRange("A4:G4").values = [["科目编码", "科目名称", "余额方向", "期初余额", "本期借方", "本期贷方", "期末余额"]];
header(balances.getRange("A4:G4"));
const accounts = [
  ["1001", "库存现金", "借"], ["1002", "银行存款", "借"], ["1122", "应收账款", "借"], ["1221", "其他应收款", "借"],
  ["1601", "固定资产", "借"], ["1602", "累计折旧", "贷"], ["2001", "短期借款", "贷"], ["2202", "应付账款", "贷"],
  ["2211", "应付职工薪酬", "贷"], ["2221", "应交税费", "贷"], ["2241", "其他应付款—股东", "贷"], ["4001", "实收资本", "贷"],
  ["4002", "资本公积", "贷"], ["4101", "盈余公积", "贷"], ["4103", "本年利润", "贷"], ["4104", "利润分配", "贷"],
  ["5001", "主营业务收入", "贷"], ["5051", "其他业务收入", "贷"], ["5301", "营业外收入", "贷"], ["5401", "主营业务成本", "借"],
  ["5403", "税金及附加", "借"], ["5601", "销售费用", "借"], ["5602", "管理费用", "借"], ["5603", "财务费用", "借"],
  ["5711", "营业外支出", "借"], ["5801", "所得税费用", "借"],
];
balances.getRange(`A5:C${4 + accounts.length}`).values = accounts;
input(balances.getRange(`D5:D${4 + accounts.length}`));
for (let r = 5; r <= 4 + accounts.length; r++) {
  balances.getRange(`E${r}`).formulas = [[`=SUMIFS('记账凭证'!$G$5:$G$204,'记账凭证'!$E$5:$E$204,A${r})`]];
  balances.getRange(`F${r}`).formulas = [[`=SUMIFS('记账凭证'!$H$5:$H$204,'记账凭证'!$E$5:$E$204,A${r})`]];
  balances.getRange(`G${r}`).formulas = [[`=IF(C${r}="借",D${r}+E${r}-F${r},D${r}+F${r}-E${r})`]];
}
balances.getRange(`D5:G${4 + accounts.length}`).format.numberFormat = "#,##0.00;[Red](#,##0.00);-";
balances.getRange(`A4:G${4 + accounts.length}`).format.borders = { insideHorizontal: { style: "thin", color: colors.border }, bottom: { style: "thin", color: colors.border } };
balances.freezePanes.freezeRows(4);
balances.getRange("A:A").format.columnWidth = 14;
balances.getRange("B:B").format.columnWidth = 24;
balances.getRange("C:C").format.columnWidth = 12;
balances.getRange("D:G").format.columnWidth = 16;

// 税务测算
title(tax, "税务测算（复核用，不替代申报表）", "N");
tax.getRange("A4:B7").values = [
  ["关键参数", "数值"],
  ["季度起征点", "='工作台'!B10"],
  ["小规模征收率", "='工作台'!B11"],
  ["小微企业所得税估算率", "='工作台'!B12"],
];
header(tax.getRange("A4:B4"));
tax.getRange("B5").formulas = [["='工作台'!B10"]];
tax.getRange("B6").formulas = [["='工作台'!B11"]];
tax.getRange("B7").formulas = [["='工作台'!B12"]];
tax.getRange("B5").format.numberFormat = "#,##0";
tax.getRange("B6:B7").format.numberFormat = "0.0%";
tax.getRange("A9:N9").values = [["季度", "季度开始", "季度结束", "销项销售额", "已计税额", "0%/免税录入额", "增值税估算", "增值税判断", "累计会计利润", "累计纳税调整", "累计应纳税所得额", "累计企业所得税", "以前已预缴", "本次所得税估算"]];
header(tax.getRange("A9:N9"));
tax.getRange("A10:C13").values = [
  ["一季度", new Date(2026, 0, 1), new Date(2026, 2, 31)],
  ["二季度", new Date(2026, 3, 1), new Date(2026, 5, 30)],
  ["三季度", new Date(2026, 6, 1), new Date(2026, 8, 30)],
  ["四季度", new Date(2026, 9, 1), new Date(2026, 11, 31)],
];
tax.getRange("B10:C13").format.numberFormat = "yyyy-mm-dd";
for (let r = 10; r <= 13; r++) {
  tax.getRange(`D${r}`).formulas = [[`=SUMIFS('发票台账'!$I$5:$I$154,'发票台账'!$A$5:$A$154,">="&B${r},'发票台账'!$A$5:$A$154,"<="&C${r},'发票台账'!$B$5:$B$154,"销项",'发票台账'!$K$5:$K$154,"正常")`]];
  tax.getRange(`E${r}`).formulas = [[`=SUMIFS('发票台账'!$J$5:$J$154,'发票台账'!$A$5:$A$154,">="&B${r},'发票台账'!$A$5:$A$154,"<="&C${r},'发票台账'!$B$5:$B$154,"销项",'发票台账'!$K$5:$K$154,"正常")`]];
  tax.getRange(`F${r}`).formulas = [[`=SUMIFS('发票台账'!$I$5:$I$154,'发票台账'!$A$5:$A$154,">="&B${r},'发票台账'!$A$5:$A$154,"<="&C${r},'发票台账'!$B$5:$B$154,"销项",'发票台账'!$H$5:$H$154,0,'发票台账'!$K$5:$K$154,"正常")`]];
  tax.getRange(`G${r}`).formulas = [[`=IF(D${r}<=$B$5,E${r},E${r}+F${r}/(1+$B$6)*$B$6)`]];
  tax.getRange(`H${r}`).formulas = [[`=IF(D${r}<=$B$5,"未达起征点；专票/放弃免税部分仍核税","达到起征点；核对全部销售和未开票收入")`]];
  tax.getRange(`I${r}`).formulas = [[`=SUMIFS('记账凭证'!$H$5:$H$204,'记账凭证'!$A$5:$A$204,">="&$B$10,'记账凭证'!$A$5:$A$204,"<="&C${r},'记账凭证'!$I$5:$I$204,"收入")-SUMIFS('记账凭证'!$G$5:$G$204,'记账凭证'!$A$5:$A$204,">="&$B$10,'记账凭证'!$A$5:$A$204,"<="&C${r},'记账凭证'!$I$5:$I$204,"收入")-SUMIFS('记账凭证'!$G$5:$G$204,'记账凭证'!$A$5:$A$204,">="&$B$10,'记账凭证'!$A$5:$A$204,"<="&C${r},'记账凭证'!$I$5:$I$204,"成本费用")+SUMIFS('记账凭证'!$H$5:$H$204,'记账凭证'!$A$5:$A$204,">="&$B$10,'记账凭证'!$A$5:$A$204,"<="&C${r},'记账凭证'!$I$5:$I$204,"成本费用")`]];
  tax.getRange(`K${r}`).formulas = [[`=MAX(0,I${r}+J${r})`]];
  tax.getRange(`L${r}`).formulas = [[`=K${r}*$B$7`]];
  tax.getRange(`N${r}`).formulas = [[`=MAX(0,L${r}-M${r})`]];
}
input(tax.getRange("J10:J13"));
input(tax.getRange("M10:M13"));
tax.getRange("D10:G13").format.numberFormat = "#,##0.00;[Red](#,##0.00);-";
tax.getRange("I10:N13").format.numberFormat = "#,##0.00;[Red](#,##0.00);-";
tax.getRange("A16:N19").values = [
  ["说明", "销售额含未开票收入；若有未开票收入，应在发票台账以发票类型“收据/其他”补录。", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["说明", "小规模纳税人进项税额通常不抵扣。本页不计算进项抵扣。", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["说明", "企业所得税采用累计估算。纳税调整需手工填入，例如无票费用、业务招待费限额、罚款等。", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["说明", "是否符合小型微利企业条件需年度判断：非限制行业、应纳税所得额≤300万元、人数≤300、资产≤5000万元。", "", "", "", "", "", "", "", "", "", "", "", ""],
];
for (let r = 16; r <= 19; r++) tax.getRange(`B${r}:N${r}`).merge();
tax.getRange("A16:N19").format.fill = colors.paleBlue;
tax.getRange("A16:N19").format.wrapText = true;
tax.getRange("A16:N19").format.rowHeight = 28;
tax.getRange("A:A").format.columnWidth = 14;
tax.getRange("B:C").format.columnWidth = 14;
tax.getRange("D:G").format.columnWidth = 16;
tax.getRange("H:H").format.columnWidth = 32;
tax.getRange("I:N").format.columnWidth = 17;

// 申报日历
title(calendar, "申报与合规日历", "H");
calendar.getRange("A4:H4").values = [["频率", "建议时间", "事项", "办理入口", "是否无业务也要做", "完成", "凭证/回执文件名", "备注"]];
header(calendar.getRange("A4:H4"));
calendar.getRange("A5:E18").values = [
  ["每笔", "业务发生当日", "合同、交付/验收、发票、款项分别留证并编号", "公司文件夹+本工作簿", "是",],
  ["每笔", "股东实缴后20个工作日内", "公示实缴出资额、方式和日期", "国家企业信用信息公示系统", "发生时必须",],
  ["每月", "次月1—5日", "下载银行对账单、数电票清单；匹配票、款、合同", "开户行+电子税务局", "是",],
  ["每月", "次月10日前", "完成上月记账、对账、资产负债表和利润表", "本工作簿", "是",],
  ["每月", "通常次月15日前", "向个人支付工资、劳务、董事费、分红等时办理个税扣缴", "自然人电子税务局（扣缴端）", "按税种认定/支付情况",],
  ["每季", "1/4/7/10月申报期限内", "增值税及附加税费申报；检查专票、免税和未开票收入", "江苏电子税务局应申报清册", "是",],
  ["每季", "1/4/7/10月申报期限内", "企业所得税季度预缴", "江苏电子税务局", "是",],
  ["每季", "1/4/7/10月申报期限内", "印花税申报（技术合同等按税种认定）", "江苏电子税务局", "按税种认定",],
  ["每季", "1/4/7/10月申报期限内", "资产负债表、利润表等财务报表报送", "江苏电子税务局", "是",],
  ["每年", "5月31日前", "上年度企业所得税汇算清缴", "江苏电子税务局", "是",],
  ["每年", "6月30日前", "上年度企业年度报告", "国家企业信用信息公示系统", "是",],
  ["每年", "3月1日—6月30日", "个人综合所得汇算；有两处工资/劳务尤其核对", "个人所得税App", "符合条件时",],
  ["每年", "12月结账前", "清理股东借款、应收应付；盘点资产；准备年度财务报告", "本工作簿", "是",],
  ["按章程", "认缴到期前", "完成注册资本实缴；旧公司关注2027-06-30调整节点", "银行+市场监管系统", "是",],
];
input(calendar.getRange("F5:H18"));
calendar.getRange("F5:F18").dataValidation = { rule: { type: "list", values: ["未开始", "进行中", "已完成", "不适用"] } };
calendar.getRange("A4:H18").format.borders = { insideHorizontal: { style: "thin", color: colors.border }, bottom: { style: "thin", color: colors.border } };
calendar.getRange("F5:F18").conditionalFormats.add("containsText", { text: "已完成", format: { fill: colors.green, font: { color: "#375623", bold: true } } });
calendar.getRange("F5:F18").conditionalFormats.add("containsText", { text: "未开始", format: { fill: colors.red, font: { color: "#C00000", bold: true } } });
calendar.freezePanes.freezeRows(4);
calendar.getRange("A:B").format.columnWidth = 18;
calendar.getRange("C:C").format.columnWidth = 42;
calendar.getRange("D:D").format.columnWidth = 30;
calendar.getRange("E:F").format.columnWidth = 18;
calendar.getRange("G:H").format.columnWidth = 26;
calendar.getRange("A5:H18").format.wrapText = true;

// Example entries in the first rows, kept visually distinct and ready to overwrite.
invoices.getRange("A5:O6").values = [
  [new Date(2026, 0, 15), "销项", "数电普票", "示例-软件开发", "示例客户", "示例001", 10000, 0, null, null, "正常", "已收/付", "记-001", "示例001.pdf", "季度未达起征点时普通票免税示例；请覆盖"],
  [new Date(2026, 0, 20), "进项", "数电普票", "示例-软件开发", "示例供应商", "示例002", 500, 0.01, null, null, "正常", "已收/付", "记-002", "示例002.pdf", "小规模进项税一般不抵扣；请覆盖"],
];
bank.getRange("A5:N7").values = [
  [new Date(2026, 0, 2), "基本户", "示例B001", "收", "股东本人", "股东实缴出资", 10000, "", "股东出资", "", "记-001", "是", "B001.pdf", "转账备注写投资款；请覆盖"],
  [new Date(2026, 0, 15), "基本户", "示例B002", "收", "示例客户", "项目回款", 10000, "示例-软件开发", "客户回款", "示例001", "记-002", "是", "B002.pdf", "请覆盖"],
  [new Date(2026, 0, 20), "基本户", "示例B003", "支", "股东本人", "报销业务支出", 500, "示例-软件开发", "费用报销", "示例002", "记-003", "是", "B003.pdf", "需报销单及业务证据；请覆盖"],
];
journal.getRange("A5:M10").values = [
  [new Date(2026, 0, 2), "记-001", 1, "股东实缴出资", "1002", "银行存款", 10000, 0, "非损益", "", "股东本人", "", "示例B001"],
  [new Date(2026, 0, 2), "记-001", 2, "股东实缴出资", "4001", "实收资本", 0, 10000, "非损益", "", "股东本人", "", "示例B001"],
  [new Date(2026, 0, 15), "记-002", 1, "确认软件开发收入", "1002", "银行存款", 10000, 0, "非损益", "示例-软件开发", "示例客户", "示例001", "示例B002"],
  [new Date(2026, 0, 15), "记-002", 2, "确认软件开发收入", "5001", "主营业务收入", 0, 10000, "收入", "示例-软件开发", "示例客户", "示例001", "示例B002"],
  [new Date(2026, 0, 20), "记-003", 1, "报销项目工具费", "5602", "管理费用", 500, 0, "成本费用", "示例-软件开发", "示例供应商", "示例002", "示例B003"],
  [new Date(2026, 0, 20), "记-003", 2, "支付报销款", "1002", "银行存款", 0, 500, "非损益", "示例-软件开发", "股东本人", "示例002", "示例B003"],
];
journal.getRange("O5:O10").values = [["B001.pdf"], ["B001.pdf"], ["合同+验收+发票+回单"], ["合同+验收+发票+回单"], ["报销单+发票"], ["报销单+回单"]];

// Restore formulas overwritten by example rows.
for (let r = 5; r <= 6; r++) {
  invoices.getRange(`I${r}`).formulas = [[`=IF(G${r}="","",G${r}/(1+H${r}))`]];
  invoices.getRange(`J${r}`).formulas = [[`=IF(G${r}="","",G${r}-I${r})`]];
}
for (let r = 5; r <= 10; r++) {
  journal.getRange(`N${r}`).formulas = [[`=IF(B${r}="","",SUMIFS($G$5:$G$204,$B$5:$B$204,B${r})-SUMIFS($H$5:$H$204,$B$5:$B$204,B${r}))`]];
}

// Tab colors and final recalculation.
desk.tabColor = colors.navy;
tax.tabColor = colors.blue;
calendar.tabColor = "#5B9BD5";
invoices.tabColor = "#A9D18E";
bank.tabColor = "#A9D18E";
journal.tabColor = "#A9D18E";
balances.tabColor = "#A9D18E";

wb.recalculate();
await fs.mkdir(outputDir, { recursive: true });

const checks = {};
checks.workbench = (await wb.inspect({ kind: "table", range: "工作台!A2:J30", include: "values,formulas", tableMaxRows: 30, tableMaxCols: 10 })).ndjson;
checks.journal = (await wb.inspect({ kind: "table", range: "记账凭证!A4:O12", include: "values,formulas", tableMaxRows: 12, tableMaxCols: 15 })).ndjson;
checks.tax = (await wb.inspect({ kind: "table", range: "税务测算!A4:N19", include: "values,formulas", tableMaxRows: 20, tableMaxCols: 14 })).ndjson;
checks.errors = (await wb.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!", options: { useRegex: true, maxResults: 300 }, summary: "final formula error scan" })).ndjson;

for (const [name, sheetName, range] of [
  ["工作台", "工作台", "A1:J31"],
  ["发票台账", "发票台账", "A1:O12"],
  ["银行流水", "银行流水", "A1:N12"],
  ["记账凭证", "记账凭证", "A1:O14"],
  ["科目余额", "科目余额", "A1:G30"],
  ["税务测算", "税务测算", "A1:N19"],
  ["申报日历", "申报日历", "A1:H18"],
]) {
  const preview = await wb.render({ sheetName, range, scale: 1, format: "png" });
  await fs.writeFile(`${outputDir}/${name}.png`, new Uint8Array(await preview.arrayBuffer()));
}

const output = await SpreadsheetFile.exportXlsx(wb);
await output.save(outputPath);
await fs.writeFile(`${outputDir}/verification.json`, JSON.stringify(checks, null, 2), "utf8");
console.log(JSON.stringify({ outputPath, checks: Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, v.slice(0, 1200)])) }, null, 2));
