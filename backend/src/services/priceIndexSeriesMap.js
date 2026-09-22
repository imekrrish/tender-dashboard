/**
 * TaiyangNews PV Price Index — series dictionary.
 *
 * Sheet2 of the workbook is the authoritative grid: one row per quoted product,
 * one column per publication date. Its row labels are Chinese (品种 = variety,
 * 规格 = specification), so this file maps each row onto the English naming the
 * rest of the index uses, plus the component / sub-group taxonomy the dashboard
 * filters on.
 *
 * Key = `${品种}|${规格}` with whitespace collapsed (see seriesKey below), which
 * survives rows being re-ordered or the ID column being left blank in a newer
 * weekly release.
 */

export const COMPONENTS = ['Polysilicon', 'Wafer', 'Cell', 'Module', 'Glass'];

/** Component inferred from the workbook's own ID column, used as a fallback. */
export const ID_PREFIX_COMPONENT = {
  A: 'Polysilicon',
  B: 'Wafer',
  C: 'Cell',
  D: 'Module',
  E: 'Glass',
};

/** Collapse whitespace (some specs carry an embedded CRLF) before keying. */
export function seriesKey(variety, spec) {
  const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
  return `${clean(variety)}|${clean(spec)}`;
}

const S = (component, group, name, unit, currency) => ({
  component,
  group,
  name,
  unit,
  currency,
});

export const SERIES_MAP = {
  // ---------------------------------------------------------------- Polysilicon
  [seriesKey('中国产复投多晶硅料9N', '单晶用料-复投')]:
    S('Polysilicon', 'p-Type', 'Reusable Chinese 9N', 'RMB/kg', 'RMB'),
  [seriesKey('中国产致密多晶硅料9N', '单晶用料-致密')]:
    S('Polysilicon', 'p-Type', 'Chinese 9N', 'RMB/kg', 'RMB'),
  [seriesKey('中国产多晶硅料8N', '多晶用料')]:
    S('Polysilicon', 'Multi', 'Chinese 8N (multi grade)', 'RMB/kg', 'RMB'),
  [seriesKey('全球多晶硅料', '—')]:
    S('Polysilicon', 'Global', 'Global', 'USD/kg', 'USD'),
  [seriesKey('N型料', 'N型用料')]:
    S('Polysilicon', 'n-Type', 'n-Type Silicon in China', 'RMB/kg', 'RMB'),
  [seriesKey('颗粒硅', '颗粒硅')]:
    S('Polysilicon', 'Granular', 'Granular Silicon', 'RMB/kg', 'RMB'),

  // --------------------------------------------------------------------- Wafer
  [seriesKey('多晶硅片高效', '157mm x 157mm')]:
    S('Wafer', 'Multi', 'Multi wafer, high efficiency, 157 mm', 'RMB/piece', 'RMB'),
  [seriesKey('多晶硅片中效', '157mm x 157mm')]:
    S('Wafer', 'Multi', 'Multi wafer, medium efficiency, 157 mm', 'RMB/piece', 'RMB'),
  [seriesKey('单晶硅片（170um）', '158.75mm x 158.75mm')]:
    S('Wafer', 'p-type', 'p-type, 158.75 mm, 170 µm', 'RMB/piece', 'RMB'),
  [seriesKey('166mm单晶硅片（170um）', '166mm x 166mm（170um）')]:
    S('Wafer', 'p-type', 'p-type, 166 mm, 170 µm', 'RMB/piece', 'RMB'),
  [seriesKey('166mm单晶硅片（165um）（New！）', '166mm x 166mm（165um）')]:
    S('Wafer', 'p-type', 'p-type, 166 mm, 165 µm', 'RMB/piece', 'RMB'),
  [seriesKey('166mm单晶硅片（160um）', '166mm x 166mm（160um）')]:
    S('Wafer', 'p-type', 'p-type, 166 mm, 160 µm', 'RMB/piece', 'RMB'),
  [seriesKey('166mm单晶硅片（155um）（New！）', '166mm x 166mm（155um）')]:
    S('Wafer', 'p-type', 'p-type, 166 mm, 155 µm', 'RMB/piece', 'RMB'),
  [seriesKey('166mm单晶硅片（150um）', '166mm x 166mm（150um）')]:
    S('Wafer', 'p-type', 'p-type, 166 mm, 150 µm', 'RMB/piece', 'RMB'),
  [seriesKey('单晶硅片(170um)', '182mm*182mm（170 um）')]:
    S('Wafer', 'p-type', 'p-type, 182 mm, 170 µm', 'RMB/piece', 'RMB'),
  [seriesKey('182mm单晶硅片（New！）', '182mm*182mm 单晶硅片（165 um）')]:
    S('Wafer', 'p-type', 'p-type, 182 mm, 165 µm', 'RMB/piece', 'RMB'),
  [seriesKey('182mm单晶硅片(160um）', '182mm*182mm 单晶硅片（160 um）')]:
    S('Wafer', 'p-type', 'p-type, 182 mm, 160 µm', 'RMB/piece', 'RMB'),
  [seriesKey('182mm单晶硅片(155um）', '182mm*182mm 单晶硅片（155 um）')]:
    S('Wafer', 'p-type', 'p-type, 182 mm, 155 µm', 'RMB/piece', 'RMB'),
  [seriesKey('182mm单晶硅片(150um)', '182mm*182mm（150 um）')]:
    S('Wafer', 'p-type', 'p-type, 182 mm, 150 µm', 'RMB/piece', 'RMB'),
  [seriesKey('单晶硅片', '210mm*210mm')]:
    S('Wafer', 'p-type', 'p-type, 210 mm', 'RMB/piece', 'RMB'),
  [seriesKey('210mm单晶硅片（New！）', '210mm*210mm 单晶硅片（165 um）')]:
    S('Wafer', 'p-type', 'p-type, 210 mm, 165 µm', 'RMB/piece', 'RMB'),
  [seriesKey('210mm单晶硅片(160um)', '210mm*210mm 单晶硅片（160 um）')]:
    S('Wafer', 'p-type', 'p-type, 210 mm, 160 µm', 'RMB/piece', 'RMB'),
  [seriesKey('210mm单晶硅片(155um)', '210mm*210mm 单晶硅片（155 um）')]:
    S('Wafer', 'p-type', 'p-type, 210 mm, 155 µm', 'RMB/piece', 'RMB'),
  [seriesKey('210mm单晶硅片(150um)', '210mm*210mm 单晶硅片（150 um）')]:
    S('Wafer', 'p-type', 'p-type, 210 mm, 150 µm', 'RMB/piece', 'RMB'),
  [seriesKey('N型-166mm单晶硅片(150um）', '166mm x 166mm')]:
    S('Wafer', 'n-type', 'n-type, 166 mm, 150 µm', 'RMB/piece', 'RMB'),
  [seriesKey('N型-210mm单晶硅片(150um)（New！）', '210mm*210mm 单晶硅片（150 um）')]:
    S('Wafer', 'n-type', 'n-type, 210 mm, 150 µm', 'RMB/piece', 'RMB'),
  [seriesKey('N型-182mm单晶硅片', '182mm x 182mmN型单晶硅片（130 um）')]:
    S('Wafer', 'n-type', 'n-type, 182 mm, 130 µm', 'RMB/piece', 'RMB'),
  [seriesKey('N型-210mm单晶硅片', '210mm*210mmN型单晶硅片（130 um）')]:
    S('Wafer', 'n-type', 'n-type, 210 mm, 130 µm', 'RMB/piece', 'RMB'),
  [seriesKey('N型-210Rmm单晶硅片（130um）', '182.2*210mm')]:
    S('Wafer', 'n-type', 'n-type, 210R, 130 µm', 'RMB/piece', 'RMB'),

  // ---------------------------------------------------------------------- Cell
  [seriesKey('多晶电池片(＞18.8%)', '156.75mm x 156.75mm')]:
    S('Cell', 'Multi', 'Multi cell (>18.8%), 156.75 mm', 'RMB/W', 'RMB'),
  [seriesKey('单晶PERC电池片（21.7-22.1%)', '158.75mm x 158.75mm')]:
    S('Cell', 'PERC', 'PERC mono (21.7–22.1%), 158.75 mm', 'RMB/W', 'RMB'),
  [seriesKey('双面单晶PERC电池片（＞21.9%)', '166mm x 166mm')]:
    S('Cell', 'PERC', 'PERC bifacial - p-type, 166 mm', 'RMB/W', 'RMB'),
  [seriesKey('双面单晶PERC电池片(＞22.3%)', '182mm*182mm')]:
    S('Cell', 'PERC', 'PERC bifacial - p-type, 182 mm', 'RMB/W', 'RMB'),
  [seriesKey('双面单晶PERC电池片(＞22.4%)', '210mm*210mm')]:
    S('Cell', 'PERC', 'PERC bifacial - p-type, 210 mm', 'RMB/W', 'RMB'),
  [seriesKey('双面Topcon电池片（＞24.3%）', '182mm x 183.75mm')]:
    S('Cell', 'TOPCon', 'TOPCon - n-type, 182 mm', 'RMB/W', 'RMB'),
  [seriesKey('双面Topcon电池片（＞24.3%）（New！）', '210mm x 210mm')]:
    S('Cell', 'TOPCon', 'TOPCon - n-type, 210 mm', 'RMB/W', 'RMB'),
  [seriesKey('双面Topcon电池片（＞24.3%）', '182.2mm x 210mm')]:
    S('Cell', 'TOPCon', 'TOPCon - n-type, 210R (above 24.3%)', 'RMB/W', 'RMB'),

  // -------------------------------------------------------------------- Module
  [seriesKey('多晶组件', '270-275W')]:
    S('Module', 'Multi', 'Multi module (270-275W)', 'RMB/W', 'RMB'),
  [seriesKey('多晶双玻组件', '270-275W')]:
    S('Module', 'Multi', 'Multi dual-glass module (270-275W)', 'RMB/W', 'RMB'),
  [seriesKey('单晶PERC组件', '320-330W / 390-410W')]:
    S('Module', 'PERC', 'Mono PERC module (320-330W / 390-410W)', 'RMB/W', 'RMB'),
  [seriesKey('单晶PERC组件', '355-365W / 430-440W')]:
    S('Module', 'PERC', 'Mono PERC module (355-365W / 430-440W)', 'RMB/W', 'RMB'),
  [seriesKey('单面单晶perc组件（182系列）', '530-540W（72片）')]:
    S('Module', 'PERC', 'PERC monofacial - p-type, 182 mm (540-550W)/(420-495W)', 'RMB/W', 'RMB'),
  [seriesKey('双面单晶perc组件（182系列）', '530-540W（72片）')]:
    S('Module', 'PERC', 'PERC bifacial - p-type, 182 mm, 72 cells (540-550W)/(420-495W)', 'RMB/W', 'RMB'),
  [seriesKey('双面单晶perc组件（210系列）', '540-550W（50片）')]:
    S('Module', 'PERC', 'PERC bifacial - p-type, 210 mm, 55 cells (540-550W)', 'RMB/W', 'RMB'),
  [seriesKey('双面Topcon组件（182系列）', '550-570W（72片）')]:
    S('Module', 'TOPCon', 'TOPCon bifacial - n-type, 182 mm, 72 cells (580-590W)', 'RMB/W', 'RMB'),
  [seriesKey('N型双面Topcon 组件（210系列）', '630-655W（60片）')]:
    S('Module', 'TOPCon', 'TOPCon bifacial - n-type, 210 mm, 60 cells (620-630W)', 'RMB/W', 'RMB'),
  [seriesKey('N型双面Topcon 组件（210系列）', '730-745W（66片）')]:
    S('Module', 'TOPCon', 'TOPCon bifacial - n-type, 210 mm, 66 cells (710-735W)', 'RMB/W', 'RMB'),
  [seriesKey('N型双面Topcon 组件（210R系列）', '620-630W（66片）')]:
    S('Module', 'TOPCon', 'TOPCon bifacial - n-type, 210R, 66 cells (610-635W)', 'RMB/W', 'RMB'),
  [seriesKey('N型双面Topcon组件（210R系列）', '635-640W （三分片/2.0）')]:
    S('Module', 'TOPCon', 'TOPCon bifacial - n-type, 210R (635-640W, 1/3-cut 2.0)', 'RMB/W', 'RMB'),
  [seriesKey('N型双面Topcon组件（210R系列）', '645-650W（四分片/3.0）')]:
    S('Module', 'TOPCon', 'TOPCon bifacial - n-type, 210R (645-650W, 1/4-cut 3.0)', 'RMB/W', 'RMB'),
  [seriesKey('N型双面HJT组件（210系列）', '615-635W')]:
    S('Module', 'HJT', '210 mm HJT module (615-635W)', 'RMB/W', 'RMB'),
  [seriesKey('N型双面HJT组件（210系列） New！', '715-730W')]:
    S('Module', 'HJT', '210 mm HJT module (715-730W)', 'RMB/W', 'RMB'),
  [seriesKey('N型双面BC组件（210R系列）New！', '650-675W')]:
    S('Module', 'BC', 'BC module (650-675W)', 'RMB/W', 'RMB'),
  [seriesKey('N型双面BC组件（210R系列）集中式项目价格New！', '640-670W')]:
    S('Module', 'BC', 'BC module (640-670W) 210R, utility project price', 'RMB/W', 'RMB'),
  [seriesKey('中国区-项目价', '>385W')]:
    S('Module', 'China project price', 'China project price (>385W)', 'RMB/W', 'RMB'),
  [seriesKey('中国区-项目价', '≥630W')]:
    S('Module', 'China project price', 'China project price (≥630W)', 'RMB/W', 'RMB'),
  [seriesKey('中国区-项目价', '≥615W')]:
    S('Module', 'China project price', 'China project price (≥615W)', 'RMB/W', 'RMB'),
  [seriesKey('中国区-项目价 New！', '≥630W')]:
    S('Module', 'China project price', 'China project price (≥630W, new)', 'RMB/W', 'RMB'),
  [seriesKey('欧洲港口现货', '≥580w')]:
    S('Module', 'Port spot', 'Europe port spot (≥580W)', 'USD/W', 'USD'),
  [seriesKey('印度港口现货', '≥580w')]:
    S('Module', 'Port spot', 'India port spot (≥580W)', 'USD/W', 'USD'),
  [seriesKey('美国港口现货', '≥580w')]:
    S('Module', 'Port spot', 'US port spot (≥580W)', 'USD/W', 'USD'),

  // --------------------------------------------------------------------- Glass
  [seriesKey('光伏玻璃', '3.2mm')]:
    S('Glass', 'Solar glass', 'Solar glass 3.2 mm', 'RMB/m²', 'RMB'),
  [seriesKey('光伏玻璃', '2.0mm')]:
    S('Glass', 'Solar glass', 'Solar glass 2.0 mm', 'RMB/m²', 'RMB'),
};

/** Unit fallback when the workbook leaves 单位 blank and the row is unmapped. */
export const COMPONENT_DEFAULT_UNIT = {
  Polysilicon: 'RMB/kg',
  Wafer: 'RMB/piece',
  Cell: 'RMB/W',
  Module: 'RMB/W',
  Glass: 'RMB/m²',
};
