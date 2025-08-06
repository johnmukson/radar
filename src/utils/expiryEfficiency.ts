interface ExpiryMetrics {
  criticalItems: number;
  nearExpiryItems: number;
  expiredItems: number;
  totalItems: number;
  criticalValue: number;
  nearExpiryValue: number;
  expiredValue: number;
  totalValue: number;
}

interface HistoricalDataPoint extends ExpiryMetrics {
  period: string;
  expiredValue: number;
}

export const calculateExpiryEfficiency = (metrics: ExpiryMetrics) => {
  // Calculate various expiry-related metrics
  const criticalRate = (metrics.criticalItems / metrics.totalItems) * 100;
  const nearExpiryRate = (metrics.nearExpiryItems / metrics.totalItems) * 100;
  const expiredRate = (metrics.expiredItems / metrics.totalItems) * 100;
  
  // Calculate value-based metrics
  const criticalValueRate = (metrics.criticalValue / metrics.totalValue) * 100;
  const nearExpiryValueRate = (metrics.nearExpiryValue / metrics.totalValue) * 100;
  const expiredValueRate = (metrics.expiredValue / metrics.totalValue) * 100;

  // Calculate overall expiry risk score (0-100, higher is better)
  const expiryRiskScore = 100 - (
    (criticalRate * 0.4) + // Critical items weighted more heavily
    (nearExpiryRate * 0.3) +
    (expiredRate * 0.3)
  );

  // Calculate value preservation score (0-100, higher is better)
  const valuePreservationScore = 100 - (
    (criticalValueRate * 0.4) +
    (nearExpiryValueRate * 0.3) +
    (expiredValueRate * 0.3)
  );

  // Calculate early warning effectiveness
  const earlyWarningScore = criticalRate > 0 ? 
    ((metrics.nearExpiryItems / metrics.criticalItems) * 100) : 100;

  // Calculate overall efficiency score
  const efficiencyScore = (
    (expiryRiskScore * 0.4) +
    (valuePreservationScore * 0.4) +
    (earlyWarningScore * 0.2)
  );

  return {
    expiryRiskScore,
    valuePreservationScore,
    earlyWarningScore,
    efficiencyScore,
    criticalRate,
    nearExpiryRate,
    expiredRate,
    criticalValueRate,
    nearExpiryValueRate,
    expiredValueRate
  };
};

export const getExpiryEfficiencyLevel = (score: number): {
  level: string;
  color: string;
  description: string;
} => {
  if (score >= 90) {
    return {
      level: "Excellent",
      color: "text-green-500",
      description: "Outstanding expiry management with minimal risk"
    };
  } else if (score >= 80) {
    return {
      level: "Good",
      color: "text-blue-500",
      description: "Strong expiry management with low risk"
    };
  } else if (score >= 70) {
    return {
      level: "Fair",
      color: "text-yellow-500",
      description: "Adequate expiry management with moderate risk"
    };
  } else if (score >= 60) {
    return {
      level: "Needs Improvement",
      color: "text-orange-500",
      description: "Expiry management needs attention"
    };
  } else {
    return {
      level: "Critical",
      color: "text-red-500",
      description: "Immediate action required for expiry management"
    };
  }
};

export const calculateExpiryTrends = (historicalData: HistoricalDataPoint[]) => {
  // Calculate month-over-month changes
  const trends = historicalData.map((data, index) => {
    if (index === 0) return { ...data, change: 0 };
    const previous = historicalData[index - 1];
    const change = previous && previous.expiredValue
      ? ((data.expiredValue - previous.expiredValue) / previous.expiredValue) * 100
      : 0;
    return {
      ...data,
      change
    };
  });

  // Calculate average monthly change
  const averageChange = trends.length > 0
    ? trends.reduce((acc, curr) => acc + (curr.change || 0), 0) / trends.length
    : 0;

  // Predict next month's expiry value
  const lastValue = historicalData.length > 0 && historicalData[historicalData.length - 1].expiredValue
    ? historicalData[historicalData.length - 1].expiredValue
    : 0;
  const predictedValue = lastValue * (1 + (averageChange / 100));

  return {
    trends: trends.filter(item => item && item.period !== undefined),
    averageChange,
    predictedValue: isNaN(predictedValue) ? 0 : predictedValue
  };
}; 