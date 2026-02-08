export interface CustomLiquidTag {
  id: string;
  projectId: string;
  name: string;
  signature: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomLiquidFilter {
  id: string;
  projectId: string;
  name: string;
  inputType: string;
  outputType: string;
  parameters: FilterParameter[];
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FilterParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'any';
  required: boolean;
}
