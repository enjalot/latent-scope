export const mapSelectionDomain = [0, 1, 2, 3, 99];
export const mapSelectionKey = {
  hidden: 99,
  normal: 0,
  selected: 1,
  notSelected: 2,
  hovered: 3,
};
// export const mapSelectionColorsLight = [
//   "#61409b", // 0, normal
//   "#3f007d", // 1, selected
//   "#b6b5d8", // 2, not selected
//   "#fcfbfd", // 99, hidden
// ]

export const baseColor = '#b87333';
export const baseColorDark = '#E0EFFF';

export const mapSelectionColorsLight = [
  baseColor,
  baseColor,
  baseColor,
  '#8bcf66', // 3, hovered
  '#fcfbfd', // 99, hidden
];

export const mapSelectionColorsDark = [
  baseColorDark,
  baseColorDark,
  baseColorDark,
  baseColorDark,
  '#fcfbfd', // 99, hidden
];

export const mapSelectionOpacity = [
  0.33, // normal
  0.85, // selected
  0.1, // not selected
  1, // hovered
  0, // hidden
];
export const mapPointSizeRange = [
  3, // normal
  6, // selected
  3, // not selected
  12.5, // hovered
  0, // hidden
];
