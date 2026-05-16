// src/types/intake.ts
export type IntakeStep = {
  id: string;
  label: string;
  required: boolean;
};

export type IntakeFlow = {
  steps: IntakeStep[];
};
