/**
 * Largest Triangle Three Buckets (LTTB) 降采样算法
 *
 * 用于将大量数据点压缩到固定阈值以下，同时最大限度保留趋势特征。
 * 算法保证：峰值、谷值、趋势转折点不会被抹平。
 *
 * 参考: Sveinn Steinarsson, "Downsampling Time Series for Visual Representation"
 *
 * @param {Array<{timestamp: number, fansCount: number}>} data - 原始数据点数组
 * @param {number} threshold - 目标点数
 * @returns {Array<{timestamp: number, fansCount: number}>} 降采样后的数据
 */

export function lttb(data, threshold) {
  if (!data || !Array.isArray(data)) {
    return [];
  }

  const dataLength = data.length;

  if (threshold >= dataLength || threshold <= 0) {
    return data.slice();
  }

  if (threshold <= 2) {
    return [data[0], data[dataLength - 1]];
  }

  const sampled = [];
  sampled.push(data[0]);

  const bucketSize = (dataLength - 2) / (threshold - 2);

  let a = 0;

  for (let i = 0; i < threshold - 2; i++) {
    const avgRangeStart = Math.floor((i + 1) * bucketSize) + 1;
    const avgRangeEnd = Math.floor((i + 2) * bucketSize) + 1;
    const avgRangeEndClamped = Math.min(avgRangeEnd, dataLength);

    const avgRangeLength = avgRangeEndClamped - avgRangeStart;

    // 计算下一个桶的平均点
    let avgX = 0;
    let avgY = 0;
    for (let j = avgRangeStart; j < avgRangeEndClamped; j++) {
      avgX += data[j].timestamp;
      avgY += data[j].fansCount;
    }
    avgX /= avgRangeLength;
    avgY /= avgRangeLength;

    const rangeOffs = Math.floor(i * bucketSize) + 1;
    const rangeTo = Math.floor((i + 1) * bucketSize) + 1;

    const pointA = data[a];

    let maxArea = -1;
    let maxAreaPoint = null;

    for (let j = rangeOffs; j < rangeTo; j++) {
      const area = Math.abs(
        (pointA.timestamp - avgX) * (data[j].fansCount - pointA.fansCount) -
        (pointA.timestamp - data[j].timestamp) * (avgY - pointA.fansCount)
      ) * 0.5;

      if (area > maxArea) {
        maxArea = area;
        maxAreaPoint = data[j];
      }
    }

    if (maxAreaPoint) {
      sampled.push(maxAreaPoint);
      a = data.indexOf(maxAreaPoint);
    }
  }

  sampled.push(data[dataLength - 1]);

  return sampled;
}

/**
 * 对记录数组进行 LTTB 降采样
 * @param {Array<{timestamp: number, fansCount: number, source?: string}>} records
 * @param {number} threshold
 * @returns {Array<{timestamp: number, fansCount: number, source?: string}>}
 */
export function downsampleRecords(records, threshold) {
  if (!records || records.length <= threshold) {
    return records ? records.slice() : [];
  }
  return lttb(records, threshold);
}
