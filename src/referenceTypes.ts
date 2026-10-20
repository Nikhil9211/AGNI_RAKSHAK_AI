export interface ReferenceHeatSource {
  id: string;
  latitude: number;
  longitude: number;
  name?: string;
  type?: string;
  country?: string;
  continent?: string;
  min_date?: string;
  max_date?: string;
  source: 'GIHS_2012_2021';
  dataset_url: string;
  verified?: boolean | null;
  annual_activity?: Record<string, number>;
}
