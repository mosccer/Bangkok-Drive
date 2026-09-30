// Cells of the building façade texture atlas (4 columns x 2 rows). Each cell tiles seamlessly and
// covers 28 world units across by four 6.6-unit floors.
export const FACADE_COLUMNS = 4;
export const FACADE_ROWS = 2;

export const FacadeStyle = {
  shopfront: 0,
  shophouse: 1,
  condo: 2,
  glass: 3,
  ribbon: 4,
  house: 5,
  warehouse: 6,
  ornate: 7,
} as const;

export type FacadeStyleId = (typeof FacadeStyle)[keyof typeof FacadeStyle];
