import { Component, signal, computed, viewChild, ElementRef, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatMenuModule } from '@angular/material/menu';
import { MatTabsModule } from '@angular/material/tabs';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartType } from 'chart.js';

import { ReportApiService } from '../services/report-api.service';
import { ExportService } from '../services/export.service';
import {
  ReportModule,
  ReportEntity,
  ReportField,
  ReportRelationship,
  SelectedFieldDto,
  RelatedEntityDto,
  FilterDto,
  FilterGroupDto,
  SortingDto,
  ReportConfigurationDto,
  PreviewResponse,
  SavedReportDto,
  ReportParameterDto,
  TopNConfigDto,
  FILTER_OPERATORS,
  AGGREGATION_OPTIONS,
  RELATIVE_DATE_PRESETS,
  FORMAT_OPTIONS,
  ConditionalFormatRule,
  VisualizationConfig,
  LayoutConfig,
  LayoutItem,
  DrillThroughConfig,
  DrillThroughMapping,
  SavedReportDetailDto,
} from '../models/report.models';

interface FieldSelection {
  field: ReportField;
  selected: boolean;
  aggregate: string;
  grouped: boolean;
  formatPattern: string;
}

interface FilterRow {
  fieldId: number;
  operator: string;
  value: string;
}

interface JoinConfig {
  relationship: ReportRelationship;
  joinType: string;
  entity: ReportEntity;
  fields: ReportField[];
  selectedFieldIds: number[];
}

@Component({
  selector: 'app-report-builder',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatToolbarModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatChipsModule,
    MatExpansionModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatBadgeModule,
    MatTooltipModule,
    MatDividerModule,
    MatSnackBarModule,
    MatDialogModule,
    MatButtonToggleModule,
    MatMenuModule,
    MatTabsModule,
    BaseChartDirective,
  ],
  templateUrl: './report-builder.html',
  styleUrl: './report-builder.scss',
})
export class ReportBuilder {
  modules = signal<ReportModule[]>([]);
  entities = signal<ReportEntity[]>([]);
  fields = signal<ReportField[]>([]);
  relationships = signal<ReportRelationship[]>([]);

  selectedModuleId = signal<number | null>(null);
  selectedEntityId = signal<number | null>(null);

  fieldSelections = signal<FieldSelection[]>([]);
  fieldCategories = computed(() => {
    const cats = new Map<string, FieldSelection[]>();
    for (const fs of this.fieldSelections()) {
      const cat = fs.field.category || 'General';
      if (!cats.has(cat)) cats.set(cat, []);
      cats.get(cat)!.push(fs);
    }
    return cats;
  });

  selectedFields = computed(() => this.fieldSelections().filter((f) => f.selected));
  filterableFields = computed(() =>
    this.fieldSelections()
      .filter((f) => f.field.isFilterable)
      .map((f) => f.field)
  );
  sortableFields = computed(() =>
    this.selectedFields()
      .filter((f) => f.field.isSortable)
      .map((f) => f.field)
  );

  filters = signal<FilterRow[]>([]);
  filterLogic = signal<'and' | 'or'>('and');
  sortings = signal<SortingDto[]>([]);

  joins = signal<JoinConfig[]>([]);
  availableRelationships = computed(() => {
    const entityId = this.selectedEntityId();
    if (!entityId) return [];
    const usedEntityIds = new Set(this.joins().map((j) => j.entity.entityId));
    return this.relationships().filter((r) => {
      const otherEntityId = r.primaryEntityId === entityId ? r.foreignEntityId : r.primaryEntityId;
      return !usedEntityIds.has(otherEntityId);
    });
  });

  reportTitle = signal('');
  previewResult = signal<PreviewResponse | null>(null);
  previewColumns = signal<string[]>([]);
  loading = signal(false);
  errorMessage = signal<string | null>(null);

  // Layout & visualization
  layoutType = signal<'Table' | 'Chart' | 'ChartAndTable'>('Table');
  orientation = signal<'Portrait' | 'Landscape'>('Portrait');

  currentReportId = signal<string | null>(null);
  currentReportName = signal('');
  savedReports = signal<SavedReportDto[]>([]);
  loadingReports = signal(false);
  saveDialogName = signal('');
  saveDialogDescription = signal('');
  saveDialogIsShared = signal(false);
  saveDialogIsTemplate = signal(false);

  templates = signal<SavedReportDto[]>([]);
  loadingTemplates = signal(false);
  loadDialogTab = signal<'reports' | 'templates'>('reports');
  loadDialogTabIndex = 0;

  parameters = signal<ReportParameterDto[]>([]);
  paramPromptValues = signal<Record<string, any>>({});

  distinctEnabled = signal(false);
  topNEnabled = signal(false);
  topNCount = signal(10);
  topNDirection = signal<'top' | 'bottom'>('top');
  topNFieldId = signal<number | null>(null);
  havingFilters = signal<FilterRow[]>([]);
  havingLogic = signal<'and' | 'or'>('and');
  conditionalFormats = signal<ConditionalFormatRule[]>([]);

  // Dashboard layout
  dashboardEnabled = signal(false);
  dashboardColumns = signal(2);
  dashboardWidgets = signal<VisualizationConfig[]>([]);
  dashboardLayout = signal<LayoutItem[]>([]);

  // Drill-through
  drillThroughConfigs = signal<DrillThroughConfig[]>([]);
  drillThroughStack = signal<{ reportId: string | null; reportName: string; config: ReportConfigurationDto }[]>([]);

  hasGroupings = computed(() => this.selectedFields().some((f) => f.grouped));
  aggregatedFields = computed(() =>
    this.selectedFields()
      .filter((f) => f.aggregate)
      .map((f) => f.field)
  );

  chartType = signal<ChartType>('bar');
  chartLabelField = signal<string>('');
  chartDataFields = signal<string[]>([]);

  chartCanvas = viewChild<ElementRef<HTMLCanvasElement>>('chartCanvas');
  saveDialogTpl = viewChild<TemplateRef<any>>('saveDialogTpl');
  loadDialogTpl = viewChild<TemplateRef<any>>('loadDialogTpl');
  paramPromptTpl = viewChild<TemplateRef<any>>('paramPromptTpl');

  chartConfig = computed<ChartConfiguration | null>(() => {
    const result = this.previewResult();
    const labelField = this.chartLabelField();
    const dataFields = this.chartDataFields();
    if (!result || !labelField || dataFields.length === 0) return null;

    const labels = result.data.map((row) => String(row[labelField] ?? ''));
    const colors = [
      '#1976d2', '#e53935', '#43a047', '#fb8c00', '#8e24aa',
      '#00acc1', '#6d4c41', '#d81b60', '#3949ab', '#00897b',
    ];

    const datasets = dataFields.map((field, i) => ({
      label: field,
      data: result.data.map((row) => Number(row[field]) || 0),
      backgroundColor: this.chartType() === 'line'
        ? 'transparent'
        : colors[i % colors.length] + (this.chartType() === 'pie' || this.chartType() === 'doughnut' ? '' : 'cc'),
      borderColor: colors[i % colors.length],
      borderWidth: this.chartType() === 'line' ? 2 : 1,
      tension: 0.3,
    }));

    if (this.chartType() === 'pie' || this.chartType() === 'doughnut') {
      const singleData = result.data.map((row) => Number(row[dataFields[0]]) || 0);
      return {
        type: this.chartType(),
        data: {
          labels,
          datasets: [{
            data: singleData,
            backgroundColor: labels.map((_, i) => colors[i % colors.length] + 'cc'),
            borderColor: labels.map((_, i) => colors[i % colors.length]),
            borderWidth: 1,
          }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } },
      };
    }

    return {
      type: this.chartType(),
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true } },
        plugins: { legend: { display: dataFields.length > 1 } },
      },
    };
  });

  numericColumns = computed(() =>
    this.previewColumns().filter((col) => {
      const result = this.previewResult();
      if (!result || result.data.length === 0) return false;
      return typeof result.data[0][col] === 'number';
    })
  );

  stringColumns = computed(() =>
    this.previewColumns().filter((col) => {
      const result = this.previewResult();
      if (!result || result.data.length === 0) return true;
      return typeof result.data[0][col] !== 'number';
    })
  );

  readonly CHART_TYPES: { value: ChartType; label: string; icon: string }[] = [
    { value: 'bar', label: 'Bar', icon: 'bar_chart' },
    { value: 'line', label: 'Line', icon: 'show_chart' },
    { value: 'pie', label: 'Pie', icon: 'pie_chart' },
    { value: 'doughnut', label: 'Donut', icon: 'donut_large' },
    { value: 'radar', label: 'Radar', icon: 'radar' },
    { value: 'polarArea', label: 'Polar', icon: 'all_inclusive' },
  ];

  readonly FILTER_OPERATORS = FILTER_OPERATORS;
  readonly AGGREGATION_OPTIONS = AGGREGATION_OPTIONS;
  readonly RELATIVE_DATE_PRESETS = RELATIVE_DATE_PRESETS;
  readonly FORMAT_OPTIONS = FORMAT_OPTIONS;

  constructor(
    private api: ReportApiService,
    private exportService: ExportService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    this.api.getModules().subscribe((m) => this.modules.set(m));
  }

  toggleFieldSelected(fieldId: number) {
    this.fieldSelections.update((fields) =>
      fields.map((f) =>
        f.field.fieldId === fieldId ? { ...f, selected: !f.selected } : f
      )
    );
  }

  setFieldAggregate(fieldId: number, aggregate: string) {
    this.fieldSelections.update((fields) =>
      fields.map((f) =>
        f.field.fieldId === fieldId ? { ...f, aggregate } : f
      )
    );
  }

  toggleFieldGrouped(fieldId: number) {
    this.fieldSelections.update((fields) =>
      fields.map((f) =>
        f.field.fieldId === fieldId ? { ...f, grouped: !f.grouped } : f
      )
    );
  }

  setFieldFormatPattern(fieldId: number, pattern: string) {
    this.fieldSelections.update((fields) =>
      fields.map((f) =>
        f.field.fieldId === fieldId ? { ...f, formatPattern: pattern } : f
      )
    );
  }

  getFormatOptionsForField(dataType: string) {
    return FORMAT_OPTIONS.filter((o) => o.dataTypes.includes(dataType));
  }

  formatCellValue(value: any, col: string): string {
    if (value == null) return '';
    const fs = this.selectedFields().find((f) => f.field.displayLabel === col);
    const joinFs = !fs ? this.joins().flatMap((j) =>
      j.selectedFieldIds.map((fid) => {
        const field = j.fields.find((f) => f.fieldId === fid);
        return field?.displayLabel === col ? field : null;
      }).filter(Boolean)
    ) : [];
    const pattern = fs?.formatPattern || '';
    const fieldDataType = fs?.field.dataType || (joinFs.length > 0 ? (joinFs[0] as ReportField).dataType : '');
    if (!pattern) return String(value);
    return this.applyFormat(value, pattern, fieldDataType);
  }

  private applyFormat(value: any, pattern: string, dataType: string): string {
    if (dataType === 'Number' || typeof value === 'number') {
      const num = typeof value === 'number' ? value : parseFloat(value);
      if (isNaN(num)) return String(value);
      switch (pattern) {
        case 'n0': return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
        case 'n2': return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        case 'n4': return num.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
        case 'c0': return num.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
        case 'c2': return num.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
        case 'p0': return (num * 100).toLocaleString('en-US', { maximumFractionDigits: 0 }) + '%';
        case 'p2': return (num * 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
        default: return String(value);
      }
    }
    if (dataType === 'Date' || pattern.match(/^(short|medium|long|iso|datetime)$/)) {
      const date = new Date(value);
      if (isNaN(date.getTime())) return String(value);
      switch (pattern) {
        case 'short': return date.toLocaleDateString('en-US');
        case 'medium': return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        case 'long': return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        case 'iso': return date.toISOString().slice(0, 10);
        case 'datetime': return date.toLocaleDateString('en-US') + ' ' + date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        default: return String(value);
      }
    }
    return String(value);
  }

  addConditionalFormat() {
    const cols = this.previewColumns();
    this.conditionalFormats.update((f) => [
      ...f,
      { targetColumn: cols.length > 0 ? cols[0] : '', operator: 'gt', value: '', backgroundColor: '#ffebee', textColor: '' },
    ]);
  }

  removeConditionalFormat(index: number) {
    this.conditionalFormats.update((f) => f.filter((_, i) => i !== index));
  }

  updateConditionalFormat(index: number, field: keyof ConditionalFormatRule, value: any) {
    this.conditionalFormats.update((f) =>
      f.map((rule, i) => (i === index ? { ...rule, [field]: value } : rule))
    );
  }

  getCellStyle(value: any, col: string): Record<string, string> {
    const rules = this.conditionalFormats().filter((r) => r.targetColumn === col);
    for (const rule of rules) {
      if (this.evaluateRule(value, rule)) {
        const style: Record<string, string> = {};
        if (rule.backgroundColor) style['background-color'] = rule.backgroundColor;
        if (rule.textColor) style['color'] = rule.textColor;
        if (rule.fontWeight) style['font-weight'] = rule.fontWeight;
        return style;
      }
    }
    return {};
  }

  private evaluateRule(cellValue: any, rule: ConditionalFormatRule): boolean {
    if (cellValue == null || rule.value === '') return false;
    const numCell = typeof cellValue === 'number' ? cellValue : parseFloat(cellValue);
    const numRule = parseFloat(rule.value);
    const isNumeric = !isNaN(numCell) && !isNaN(numRule);
    switch (rule.operator) {
      case 'gt': return isNumeric && numCell > numRule;
      case 'gte': return isNumeric && numCell >= numRule;
      case 'lt': return isNumeric && numCell < numRule;
      case 'lte': return isNumeric && numCell <= numRule;
      case 'eq': return isNumeric ? numCell === numRule : String(cellValue) === String(rule.value);
      case 'neq': return isNumeric ? numCell !== numRule : String(cellValue) !== String(rule.value);
      case 'between': {
        const numRule2 = parseFloat(rule.value2);
        return isNumeric && !isNaN(numRule2) && numCell >= numRule && numCell <= numRule2;
      }
      case 'contains': return String(cellValue).toLowerCase().includes(String(rule.value).toLowerCase());
      default: return false;
    }
  }

  addDashboardWidget(type: VisualizationConfig['type']) {
    const id = 'viz-' + Date.now();
    const title = type === 'Grid' ? 'Data Table' : type + ' Chart';
    const widget: VisualizationConfig = { id, type, title };
    if (type !== 'Grid') {
      widget.xAxisField = this.chartLabelField() || (this.previewColumns().length > 0 ? this.previewColumns()[0] : '');
      widget.yAxisFields = this.chartDataFields().length > 0 ? [...this.chartDataFields()] : [];
    }
    const widgets = this.dashboardWidgets();
    const row = Math.floor(widgets.length / this.dashboardColumns());
    const col = widgets.length % this.dashboardColumns();
    this.dashboardWidgets.update((w) => [...w, widget]);
    this.dashboardLayout.update((l) => [...l, { vizId: id, col, row, colSpan: 1, rowSpan: 1 }]);
  }

  removeDashboardWidget(id: string) {
    this.dashboardWidgets.update((w) => w.filter((v) => v.id !== id));
    this.dashboardLayout.update((l) => l.filter((i) => i.vizId !== id));
  }

  private readonly DEFAULT_WIDGET_TITLES = ['Data Table', 'Bar Chart', 'Line Chart', 'Pie Chart', 'Doughnut Chart', 'Radar Chart', 'PolarArea Chart'];

  updateDashboardWidget(id: string, field: keyof VisualizationConfig, value: any) {
    this.dashboardWidgets.update((w) =>
      w.map((v) => {
        if (v.id !== id) return v;
        const updated = { ...v, [field]: value };
        if (field === 'type' && this.DEFAULT_WIDGET_TITLES.includes(v.title)) {
          updated.title = value === 'Grid' ? 'Data Table' : value + ' Chart';
        }
        return updated;
      })
    );
  }

  updateLayoutItem(vizId: string, field: keyof LayoutItem, value: number) {
    this.dashboardLayout.update((l) =>
      l.map((item) => (item.vizId === vizId ? { ...item, [field]: value } : item))
    );
  }

  getWidgetChartConfig(widget: VisualizationConfig): ChartConfiguration | null {
    const result = this.previewResult();
    if (!result || !widget.xAxisField || !widget.yAxisFields?.length) return null;
    const labels = result.data.map((row) => String(row[widget.xAxisField!] ?? ''));
    const colors = ['#1976d2', '#e53935', '#43a047', '#fb8c00', '#8e24aa', '#00acc1', '#6d4c41', '#d81b60'];
    const chartType = widget.type.toLowerCase() as ChartType;
    if (chartType === 'pie' || chartType === 'doughnut') {
      return {
        type: chartType,
        data: {
          labels,
          datasets: [{ data: result.data.map((row) => Number(row[widget.yAxisFields![0]]) || 0), backgroundColor: labels.map((_, i) => colors[i % colors.length] + 'cc'), borderWidth: 1 }],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } },
      };
    }
    return {
      type: chartType,
      data: {
        labels,
        datasets: widget.yAxisFields!.map((f, i) => ({
          label: f,
          data: result.data.map((row) => Number(row[f]) || 0),
          backgroundColor: chartType === 'line' ? 'transparent' : colors[i % colors.length] + 'cc',
          borderColor: colors[i % colors.length],
          borderWidth: chartType === 'line' ? 2 : 1,
          tension: 0.3,
        })),
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, plugins: { legend: { display: widget.yAxisFields!.length > 1 } } },
    };
  }

  addDrillThrough() {
    const cols = this.previewColumns();
    this.drillThroughConfigs.update((d) => [
      ...d,
      { sourceColumn: cols.length > 0 ? cols[0] : '', targetReportId: '', targetReportName: '', parameterMappings: [] },
    ]);
  }

  removeDrillThrough(index: number) {
    this.drillThroughConfigs.update((d) => d.filter((_, i) => i !== index));
  }

  updateDrillThrough(index: number, field: keyof DrillThroughConfig, value: any) {
    this.drillThroughConfigs.update((d) =>
      d.map((cfg, i) => (i === index ? { ...cfg, [field]: value } : cfg))
    );
  }

  selectDrillThroughTarget(index: number) {
    const tpl = this.loadDialogTpl();
    if (!tpl) return;
    this.loadingReports.set(true);
    this.api.getSavedReports().subscribe({
      next: (reports) => {
        this.loadingReports.set(false);
        this.savedReports.set(reports);
      },
      error: () => this.loadingReports.set(false),
    });
    const ref = this.dialog.open(tpl, { width: '520px' });
    const originalLoadReport = this.loadReport.bind(this);
    this.loadReport = (reportId: string) => {
      const report = this.savedReports().find((r) => r.reportId === reportId);
      if (report) {
        this.updateDrillThrough(index, 'targetReportId', reportId);
        this.updateDrillThrough(index, 'targetReportName', report.name);
      }
      ref.close();
      this.loadReport = originalLoadReport;
    };
    ref.afterClosed().subscribe(() => {
      this.loadReport = originalLoadReport;
    });
  }

  addDrillThroughMapping(configIndex: number) {
    this.drillThroughConfigs.update((d) =>
      d.map((cfg, i) =>
        i === configIndex
          ? { ...cfg, parameterMappings: [...cfg.parameterMappings, { targetParamId: '', sourceColumn: '' }] }
          : cfg
      )
    );
  }

  removeDrillThroughMapping(configIndex: number, mappingIndex: number) {
    this.drillThroughConfigs.update((d) =>
      d.map((cfg, i) =>
        i === configIndex
          ? { ...cfg, parameterMappings: cfg.parameterMappings.filter((_, mi) => mi !== mappingIndex) }
          : cfg
      )
    );
  }

  updateDrillThroughMapping(configIndex: number, mappingIndex: number, field: keyof DrillThroughMapping, value: string) {
    this.drillThroughConfigs.update((d) =>
      d.map((cfg, i) =>
        i === configIndex
          ? { ...cfg, parameterMappings: cfg.parameterMappings.map((m, mi) => mi === mappingIndex ? { ...m, [field]: value } : m) }
          : cfg
      )
    );
  }

  getDrillThroughForColumn(col: string): DrillThroughConfig | undefined {
    return this.drillThroughConfigs().find((d) => d.sourceColumn === col);
  }

  onCellClick(row: Record<string, any>, col: string) {
    const dt = this.getDrillThroughForColumn(col);
    if (!dt || !dt.targetReportId) return;
    const currentConfig = this.buildFullConfig();
    this.drillThroughStack.update((s) => [
      ...s,
      { reportId: this.currentReportId(), reportName: this.currentReportName() || this.reportTitle() || 'Previous Report', config: currentConfig },
    ]);
    this.api.getSavedReport(dt.targetReportId).subscribe({
      next: (detail) => {
        for (const mapping of dt.parameterMappings) {
          if (detail.configuration.parameters) {
            const param = detail.configuration.parameters.find((p) => p.paramId === mapping.targetParamId);
            if (param) param.defaultValue = row[mapping.sourceColumn];
          }
        }
        this.currentReportId.set(detail.reportId);
        this.currentReportName.set(detail.name);
        this.restoreConfig(detail.configuration);
        this.snackBar.open(`Drilled into: ${detail.name}`, 'OK', { duration: 3000 });
        setTimeout(() => this.executePreview(), 500);
      },
      error: () => {
        this.drillThroughStack.update((s) => s.slice(0, -1));
        this.snackBar.open('Failed to load target report', 'OK', { duration: 3000 });
      },
    });
  }

  drillThroughBack() {
    const stack = this.drillThroughStack();
    if (stack.length === 0) return;
    const prev = stack[stack.length - 1];
    this.drillThroughStack.update((s) => s.slice(0, -1));
    this.currentReportId.set(prev.reportId);
    this.currentReportName.set(prev.reportName);
    this.restoreConfig(prev.config);
    this.snackBar.open(`Returned to: ${prev.reportName}`, 'OK', { duration: 2000 });
    setTimeout(() => this.executePreview(), 500);
  }

  onModuleChange(moduleId: number) {
    this.selectedModuleId.set(moduleId);
    this.selectedEntityId.set(null);
    this.fieldSelections.set([]);
    this.filters.set([]);
    this.sortings.set([]);
    this.joins.set([]);
    this.previewResult.set(null);
    this.api.getEntities(moduleId).subscribe((e) => this.entities.set(e));
  }

  onEntityChange(entityId: number) {
    this.selectedEntityId.set(entityId);
    this.filters.set([]);
    this.sortings.set([]);
    this.joins.set([]);
    this.previewResult.set(null);

    this.api.getFields(entityId).subscribe((fields) => {
      this.fields.set(fields);
      this.fieldSelections.set(
        fields
          .filter((f) => f.systemFieldName !== 'TenantId')
          .map((f) => ({ field: f, selected: false, aggregate: '', grouped: false, formatPattern: '' }))
      );
    });

    this.api.getRelationships(entityId).subscribe((r) => this.relationships.set(r));
  }

  getOperatorsForField(fieldId: number) {
    const field = this.fields().find((f) => f.fieldId === fieldId);
    if (!field) return FILTER_OPERATORS;
    return FILTER_OPERATORS.filter(
      (op) => !op.dataTypes || op.dataTypes.includes(field.dataType)
    );
  }

  getFieldLabel(fieldId: number): string {
    const allFields = [
      ...this.fields(),
      ...this.joins().flatMap((j) => j.fields),
    ];
    return allFields.find((f) => f.fieldId === fieldId)?.displayLabel || `Field ${fieldId}`;
  }

  addFilter() {
    const filterableFields = this.filterableFields();
    if (filterableFields.length === 0) return;
    this.filters.update((f) => [
      ...f,
      { fieldId: filterableFields[0].fieldId, operator: 'eq', value: '' },
    ]);
  }

  removeFilter(index: number) {
    this.filters.update((f) => f.filter((_, i) => i !== index));
  }

  addHavingFilter() {
    const agg = this.aggregatedFields();
    if (agg.length === 0) return;
    this.havingFilters.update((f) => [
      ...f,
      { fieldId: agg[0].fieldId, operator: 'gt', value: '' },
    ]);
  }

  removeHavingFilter(index: number) {
    this.havingFilters.update((f) => f.filter((_, i) => i !== index));
  }

  addSorting() {
    const sortable = this.sortableFields();
    if (sortable.length === 0) return;
    this.sortings.update((s) => [
      ...s,
      { fieldId: sortable[0].fieldId, direction: 'ASC' },
    ]);
  }

  removeSorting(index: number) {
    this.sortings.update((s) => s.filter((_, i) => i !== index));
  }

  async addJoin(rel: ReportRelationship) {
    const primaryEntityId = this.selectedEntityId()!;
    const otherEntityId =
      rel.primaryEntityId === primaryEntityId ? rel.foreignEntityId : rel.primaryEntityId;
    const otherEntityName =
      rel.primaryEntityId === primaryEntityId ? rel.foreignEntityName : rel.primaryEntityName;

    let otherEntity = this.entities().find((e) => e.entityId === otherEntityId);
    if (!otherEntity) {
      otherEntity = { entityId: otherEntityId, entityName: otherEntityName, objectType: 'View' } as ReportEntity;
    }

    this.api.getFields(otherEntityId).subscribe((fields) => {
      const joinFields = fields.filter((f) => f.systemFieldName !== 'TenantId');
      this.joins.update((j) => [
        ...j,
        {
          relationship: rel,
          joinType: 'left',
          entity: otherEntity,
          fields: joinFields,
          selectedFieldIds: [],
        },
      ]);
    });
  }

  removeJoin(index: number) {
    this.joins.update((j) => j.filter((_, i) => i !== index));
  }

  toggleJoinField(joinIndex: number, fieldId: number) {
    this.joins.update((joins) =>
      joins.map((j, i) => {
        if (i !== joinIndex) return j;
        const ids = j.selectedFieldIds.includes(fieldId)
          ? j.selectedFieldIds.filter((id) => id !== fieldId)
          : [...j.selectedFieldIds, fieldId];
        return { ...j, selectedFieldIds: ids };
      })
    );
  }

  buildConfig(): ReportConfigurationDto {
    const selected = this.selectedFields();
    const selectedFields: SelectedFieldDto[] = selected.map((fs) => ({
      fieldId: fs.field.fieldId,
      label: fs.field.displayLabel,
      aggregate: fs.aggregate || undefined,
      formatPattern: fs.formatPattern || undefined,
    }));

    const groupings = selected.filter((fs) => fs.grouped).map((fs) => fs.field.fieldId);

    const relatedEntities: RelatedEntityDto[] = this.joins()
      .filter((j) => j.selectedFieldIds.length > 0)
      .map((j) => ({
        entityId: j.entity.entityId,
        relationshipId: j.relationship.relationshipId,
        joinType: j.joinType,
        selectedFields: j.selectedFieldIds.map((fid) => {
          const f = j.fields.find((ff) => ff.fieldId === fid)!;
          return { fieldId: fid, label: f.displayLabel };
        }),
      }));

    let filterGroup: FilterGroupDto | undefined;
    const activeFilters = this.filters().filter((f) => {
      const op = FILTER_OPERATORS.find((o) => o.value === f.operator);
      return op && (!op.needsValue || f.value.trim() !== '');
    });

    if (activeFilters.length > 0) {
      filterGroup = {
        logic: this.filterLogic(),
        filters: activeFilters.map((f) => this.buildFilterDto(f)),
      };
    }

    const sortings = this.sortings().length > 0 ? this.sortings() : undefined;

    let having: FilterGroupDto | undefined;
    if (this.hasGroupings()) {
      const activeHaving = this.havingFilters().filter((f) => {
        const op = FILTER_OPERATORS.find((o) => o.value === f.operator);
        return op && (!op.needsValue || f.value.trim() !== '');
      });
      if (activeHaving.length > 0) {
        having = {
          logic: this.havingLogic(),
          filters: activeHaving.map((f) => this.buildFilterDto(f)),
        };
      }
    }

    let topN: TopNConfigDto | undefined;
    if (this.topNEnabled() && this.topNFieldId()) {
      topN = {
        count: this.topNCount(),
        direction: this.topNDirection(),
        byFieldId: this.topNFieldId()!,
      };
    }

    return {
      title: this.reportTitle() || 'Ad-hoc Report',
      moduleId: this.selectedModuleId()!,
      mode: 'preview',
      parameters: this.parameters().length > 0 ? this.parameters() : undefined,
      conditionalFormats: this.conditionalFormats().length > 0 ? this.conditionalFormats() : undefined,
      drillThrough: this.drillThroughConfigs().length > 0 ? this.drillThroughConfigs() : undefined,
      dataConfiguration: {
        primaryEntityId: this.selectedEntityId()!,
        selectedFields,
        relatedEntities: relatedEntities.length > 0 ? relatedEntities : undefined,
        distinct: this.distinctEnabled() || undefined,
        filterGroup,
        groupings: groupings.length > 0 ? groupings : undefined,
        having,
        sortings,
        topN,
      },
    };
  }

  private buildFilterDto(row: FilterRow): FilterDto {
    const field = [...this.fields(), ...this.joins().flatMap((j) => j.fields)].find(
      (f) => f.fieldId === row.fieldId
    );

    let value: any = row.value;

    if (row.operator === 'relative') {
      const preset = RELATIVE_DATE_PRESETS.find((p) => p.label === row.value);
      value = preset ? preset.value : { unit: 'day', offset: -30, anchor: 'now' };
    } else if (row.operator === 'in' || row.operator === 'notin') {
      value = row.value.split(',').map((v) => v.trim());
    } else if (row.operator === 'between') {
      const parts = row.value.split(',').map((v) => v.trim());
      value = parts.length === 2 ? parts : [row.value, row.value];
    } else if (row.operator === 'isnull' || row.operator === 'isnotnull') {
      value = undefined;
    } else if (field?.dataType === 'Number' && !row.value.startsWith('@')) {
      value = Number(row.value);
    } else if (field?.dataType === 'Boolean' && !row.value.startsWith('@')) {
      value = row.value.toLowerCase() === 'true';
    }

    return { fieldId: row.fieldId, operator: row.operator, value };
  }

  runPreview() {
    if (this.selectedFields().length === 0) {
      this.snackBar.open('Select at least one field', 'OK', { duration: 3000 });
      return;
    }
    if (this.parameters().length > 0) {
      this.promptParametersThen(() => this.executePreview());
    } else {
      this.executePreview();
    }
  }

  private promptParametersThen(callback: () => void) {
    const tpl = this.paramPromptTpl();
    if (!tpl) { callback(); return; }
    const values: Record<string, any> = {};
    for (const p of this.parameters()) {
      values[p.paramId] = p.defaultValue ?? '';
    }
    this.paramPromptValues.set(values);
    const ref = this.dialog.open(tpl, { width: '420px' });
    ref.afterClosed().subscribe((result) => {
      if (result === 'run') {
        const promptVals = this.paramPromptValues();
        this.parameters.update((params) =>
          params.map((p) => ({ ...p, defaultValue: promptVals[p.paramId] }))
        );
        callback();
      }
    });
  }

  private executePreview() {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.previewResult.set(null);
    const config = this.buildConfig();
    this.api.preview(config).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.success) {
          this.previewResult.set(res.data);
          if (res.data.data.length > 0) {
            this.previewColumns.set(Object.keys(res.data.data[0]));
          } else {
            const fields = this.selectedFields().map((f) => f.field.displayLabel);
            const joinFields = this.joins().flatMap((j) =>
              j.selectedFieldIds.map((fid) => j.fields.find((f) => f.fieldId === fid)?.displayLabel || '')
            );
            this.previewColumns.set([...fields, ...joinFields]);
          }
          this.snackBar.open(`Query completed in ${res.data.executionTimeMs}ms`, 'OK', { duration: 3000 });
        }
      },
      error: (err) => {
        this.loading.set(false);
        const msg = err.error?.errors?.[0] || err.error?.message || 'Preview failed';
        this.errorMessage.set(msg);
        this.snackBar.open(msg, 'OK', { duration: 5000 });
      },
    });
  }

  exportCsv() {
    if (this.parameters().length > 0) {
      this.promptParametersThen(() => this.serverExport('csv'));
    } else {
      this.serverExport('csv');
    }
  }

  exportExcel() {
    const result = this.previewResult();
    if (!result) return;
    const title = this.reportTitle() || 'report';
    this.exportService.exportExcel(result.data, this.previewColumns(), title);
    this.snackBar.open('Excel exported', 'OK', { duration: 2000 });
  }

  exportPdf() {
    if (this.parameters().length > 0) {
      this.promptParametersThen(() => this.serverExport('pdf'));
    } else {
      this.serverExport('pdf');
    }
  }

  private buildFullConfig(): ReportConfigurationDto {
    const config = this.buildConfig();
    config.layoutType = this.layoutType();
    config.orientation = this.orientation();
    if (
      (this.layoutType() === 'Chart' || this.layoutType() === 'ChartAndTable') &&
      this.chartLabelField() &&
      this.chartDataFields().length > 0
    ) {
      config.chartConfig = {
        chartType: this.chartType(),
        labelField: this.chartLabelField(),
        dataFields: this.chartDataFields(),
      };
    }
    if (this.dashboardEnabled() && this.dashboardWidgets().length > 0) {
      config.visualizations = this.dashboardWidgets();
      config.layout = {
        type: 'grid',
        columns: this.dashboardColumns(),
        items: this.dashboardLayout(),
      };
    }
    return config;
  }

  private serverExport(format: string) {
    if (this.selectedFields().length === 0) return;
    const config = this.buildFullConfig();
    this.snackBar.open(`Generating ${format.toUpperCase()}...`, '', { duration: 0 });
    this.api.exportFile(config, format).subscribe({
      next: (blob) => {
        const title = this.reportTitle() || 'report';
        const ext = format === 'pdf' ? 'pdf' : 'csv';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title}.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
        this.snackBar.open(`${format.toUpperCase()} downloaded`, 'OK', { duration: 3000 });
      },
      error: (err) => {
        const msg = err.error?.message || `${format.toUpperCase()} export failed`;
        this.snackBar.open(msg, 'OK', { duration: 5000 });
      },
    });
  }

  toggleChartDataField(col: string) {
    this.chartDataFields.update((fields) =>
      fields.includes(col) ? fields.filter((f) => f !== col) : [...fields, col]
    );
  }

  autoConfigureChart() {
    const cols = this.previewColumns();
    const result = this.previewResult();
    if (!result || result.data.length === 0 || cols.length === 0) return;
    const stringCols = cols.filter((c) => typeof result.data[0][c] !== 'number');
    const numCols = cols.filter((c) => typeof result.data[0][c] === 'number');
    if (stringCols.length > 0) this.chartLabelField.set(stringCols[0]);
    if (numCols.length > 0) this.chartDataFields.set([numCols[0]]);
  }

  // === Save / Load ===

  newReport() {
    this.currentReportId.set(null);
    this.currentReportName.set('');
    this.selectedModuleId.set(null);
    this.selectedEntityId.set(null);
    this.entities.set([]);
    this.fieldSelections.set([]);
    this.filters.set([]);
    this.sortings.set([]);
    this.joins.set([]);
    this.relationships.set([]);
    this.previewResult.set(null);
    this.previewColumns.set([]);
    this.errorMessage.set(null);
    this.reportTitle.set('');
    this.layoutType.set('Table');
    this.orientation.set('Portrait');
    this.chartType.set('bar');
    this.chartLabelField.set('');
    this.chartDataFields.set([]);
    this.parameters.set([]);
    this.conditionalFormats.set([]);
    this.dashboardEnabled.set(false);
    this.dashboardColumns.set(2);
    this.dashboardWidgets.set([]);
    this.dashboardLayout.set([]);
    this.drillThroughConfigs.set([]);
    this.drillThroughStack.set([]);
  }

  quickSave() {
    if (this.currentReportId()) {
      const config = this.buildFullConfig();
      this.api.updateReport(this.currentReportId()!, {
        configuration: config,
        changeDescription: 'Quick save',
      }).subscribe({
        next: () => this.snackBar.open('Report saved', 'OK', { duration: 2000 }),
        error: () => this.snackBar.open('Save failed', 'OK', { duration: 5000 }),
      });
    } else {
      this.openSaveDialog();
    }
  }

  openSaveDialog(asTemplate = false) {
    const tpl = this.saveDialogTpl();
    if (!tpl) return;
    this.saveDialogName.set(this.reportTitle() || '');
    this.saveDialogDescription.set('');
    this.saveDialogIsShared.set(false);
    this.saveDialogIsTemplate.set(asTemplate);
    const ref = this.dialog.open(tpl, { width: '420px' });
    ref.afterClosed().subscribe((result) => {
      if (result === 'save') this.performSave();
    });
  }

  private performSave() {
    const config = this.buildFullConfig();
    const isTemplate = this.saveDialogIsTemplate();
    this.api.createReport({
      name: this.saveDialogName(),
      description: this.saveDialogDescription() || undefined,
      moduleId: this.selectedModuleId()!,
      isShared: this.saveDialogIsShared(),
      isTemplate,
      configuration: config,
    }).subscribe({
      next: (saved) => {
        this.currentReportId.set(saved.reportId);
        this.currentReportName.set(saved.name);
        const label = isTemplate ? 'Template saved' : 'Saved';
        this.snackBar.open(`${label}: ${saved.name}`, 'OK', { duration: 3000 });
      },
      error: () => this.snackBar.open('Save failed', 'OK', { duration: 5000 }),
    });
  }

  openLoadDialog() {
    const tpl = this.loadDialogTpl();
    if (!tpl) return;
    this.loadDialogTab.set('reports');
    this.loadingReports.set(true);
    this.loadingTemplates.set(true);
    this.api.getSavedReports().subscribe({
      next: (reports) => {
        this.savedReports.set(reports);
        this.loadingReports.set(false);
      },
      error: () => {
        this.loadingReports.set(false);
        this.snackBar.open('Failed to load reports', 'OK', { duration: 5000 });
      },
    });
    this.api.getTemplates().subscribe({
      next: (templates) => {
        this.templates.set(templates);
        this.loadingTemplates.set(false);
      },
      error: () => {
        this.loadingTemplates.set(false);
      },
    });
    this.dialog.open(tpl, { width: '560px', maxHeight: '80vh' });
  }

  loadReport(reportId: string) {
    this.dialog.closeAll();
    this.api.getSavedReport(reportId).subscribe({
      next: (detail) => {
        this.currentReportId.set(detail.reportId);
        this.currentReportName.set(detail.name);
        this.restoreConfig(detail.configuration);
        this.snackBar.open(`Loaded: ${detail.name}`, 'OK', { duration: 3000 });
      },
      error: () => this.snackBar.open('Failed to load report', 'OK', { duration: 5000 }),
    });
  }

  deleteReport(reportId: string) {
    this.api.deleteReport(reportId).subscribe({
      next: () => {
        this.savedReports.update((r) => r.filter((rr) => rr.reportId !== reportId));
        if (this.currentReportId() === reportId) {
          this.currentReportId.set(null);
          this.currentReportName.set('');
        }
        this.snackBar.open('Report deleted', 'OK', { duration: 2000 });
      },
      error: () => this.snackBar.open('Delete failed', 'OK', { duration: 5000 }),
    });
  }

  cloneTemplate(templateId: string) {
    this.dialog.closeAll();
    this.api.cloneFromTemplate(templateId).subscribe({
      next: (detail) => {
        this.currentReportId.set(detail.reportId);
        this.currentReportName.set(detail.name);
        this.restoreConfig(detail.configuration);
        this.snackBar.open(`Created from template: ${detail.name}`, 'OK', { duration: 3000 });
      },
      error: () => this.snackBar.open('Failed to create from template', 'OK', { duration: 5000 }),
    });
  }

  private restoreConfig(config: ReportConfigurationDto) {
    this.reportTitle.set(config.title || '');
    this.layoutType.set((config.layoutType as any) || 'Table');
    this.orientation.set((config.orientation as any) || 'Portrait');
    this.parameters.set(config.parameters || []);
    this.conditionalFormats.set(config.conditionalFormats || []);
    if (config.visualizations && config.layout) {
      this.dashboardEnabled.set(true);
      this.dashboardWidgets.set(config.visualizations);
      this.dashboardColumns.set(config.layout.columns || 2);
      this.dashboardLayout.set(config.layout.items || []);
    } else {
      this.dashboardEnabled.set(false);
      this.dashboardWidgets.set([]);
      this.dashboardLayout.set([]);
    }
    this.drillThroughConfigs.set(config.drillThrough || []);
    this.previewResult.set(null);
    this.previewColumns.set([]);
    this.errorMessage.set(null);

    const moduleId = config.moduleId;
    this.selectedModuleId.set(moduleId);

    this.api.getEntities(moduleId).subscribe((entities) => {
      this.entities.set(entities);
      const entityId = config.dataConfiguration.primaryEntityId;
      this.selectedEntityId.set(entityId);

      this.api.getFields(entityId).subscribe((fields) => {
        this.fields.set(fields);
        const selectedFieldIds = new Set(config.dataConfiguration.selectedFields.map((f) => f.fieldId));
        const fieldAggregates = new Map(
          config.dataConfiguration.selectedFields.filter((f) => f.aggregate).map((f) => [f.fieldId, f.aggregate!])
        );
        const fieldFormats = new Map(
          config.dataConfiguration.selectedFields.filter((f) => f.formatPattern).map((f) => [f.fieldId, f.formatPattern!])
        );
        const groupedFieldIds = new Set(config.dataConfiguration.groupings || []);

        this.fieldSelections.set(
          fields
            .filter((f) => f.systemFieldName !== 'TenantId')
            .map((f) => ({
              field: f,
              selected: selectedFieldIds.has(f.fieldId),
              aggregate: fieldAggregates.get(f.fieldId) || '',
              grouped: groupedFieldIds.has(f.fieldId),
              formatPattern: fieldFormats.get(f.fieldId) || '',
            }))
        );

        if (config.dataConfiguration.filterGroup) {
          const fg = config.dataConfiguration.filterGroup;
          this.filterLogic.set(fg.logic);
          this.filters.set(
            (fg.filters || []).map((f) => ({
              fieldId: f.fieldId,
              operator: f.operator,
              value: f.value != null ? String(f.value) : '',
            }))
          );
        } else {
          this.filters.set([]);
          this.filterLogic.set('and');
        }

        this.sortings.set(config.dataConfiguration.sortings || []);

        this.distinctEnabled.set(config.dataConfiguration.distinct || false);

        if (config.dataConfiguration.topN) {
          this.topNEnabled.set(true);
          this.topNCount.set(config.dataConfiguration.topN.count);
          this.topNDirection.set(config.dataConfiguration.topN.direction);
          this.topNFieldId.set(config.dataConfiguration.topN.byFieldId);
        } else {
          this.topNEnabled.set(false);
          this.topNCount.set(10);
          this.topNDirection.set('top');
          this.topNFieldId.set(null);
        }

        if (config.dataConfiguration.having) {
          const hg = config.dataConfiguration.having;
          this.havingLogic.set(hg.logic);
          this.havingFilters.set(
            (hg.filters || []).map((f) => ({
              fieldId: f.fieldId,
              operator: f.operator,
              value: f.value != null ? String(f.value) : '',
            }))
          );
        } else {
          this.havingFilters.set([]);
          this.havingLogic.set('and');
        }

        if (config.chartConfig) {
          this.chartType.set(config.chartConfig.chartType as ChartType);
          this.chartLabelField.set(config.chartConfig.labelField);
          this.chartDataFields.set(config.chartConfig.dataFields);
        } else {
          this.chartLabelField.set('');
          this.chartDataFields.set([]);
        }
      });

      this.api.getRelationships(entityId).subscribe((rels) => {
        this.relationships.set(rels);
        const relatedEntities = config.dataConfiguration.relatedEntities || [];
        if (relatedEntities.length > 0) {
          const joinConfigs: JoinConfig[] = [];
          let completed = 0;
          for (const re of relatedEntities) {
            const rel = rels.find((r) => r.relationshipId === re.relationshipId);
            if (!rel) { completed++; continue; }
            this.api.getFields(re.entityId).subscribe((joinFields) => {
              const entity = entities.find((e) => e.entityId === re.entityId) ||
                ({ entityId: re.entityId, entityName: `Entity ${re.entityId}`, objectType: 'View' } as ReportEntity);
              joinConfigs.push({
                relationship: rel,
                joinType: re.joinType,
                entity,
                fields: joinFields.filter((f) => f.systemFieldName !== 'TenantId'),
                selectedFieldIds: re.selectedFields.map((sf) => sf.fieldId),
              });
              completed++;
              if (completed === relatedEntities.length) this.joins.set(joinConfigs);
            });
          }
        } else {
          this.joins.set([]);
        }
      });
    });
  }

  // === Parameters ===

  addParameter() {
    this.parameters.update((p) => [
      ...p,
      { paramId: `param${p.length + 1}`, label: '', dataType: 'String' },
    ]);
  }

  removeParameter(index: number) {
    this.parameters.update((p) => p.filter((_, i) => i !== index));
  }

  updateParameter(index: number, field: keyof ReportParameterDto, value: any) {
    this.parameters.update((p) =>
      p.map((param, i) => (i === index ? { ...param, [field]: value } : param))
    );
  }

  setParamPromptValue(paramId: string, value: any) {
    this.paramPromptValues.update((v) => ({ ...v, [paramId]: value }));
  }
}
