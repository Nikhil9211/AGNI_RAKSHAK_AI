import { 
  ThermalEvent, 
  RiskAnalysis, 
  RiskLevel, 
  AIClassification, 
  OSMContext 
} from '../../src/types.ts';

export class RiskService {
  /**
   * Explainable Risk Calculation Engine
   * Mathematical scoring with exact component breakdown:
   * - Thermal Intensity (FRP) : 30%
   * - Persistence             : 25%
   * - Industrial Context      : 20%
   * - Historical Anomaly      : 15%
   * - Detection Confidence    : 10%
   */
  public static calculateRisk(
    event: ThermalEvent, 
    osmContext: OSMContext | null = null,
    isPersistent: boolean = false,
    clusterDetectionCount: number = 1
  ): RiskAnalysis {
    const explainability: string[] = [];

    // 1. Thermal Intensity Score (0 - 30 pts)
    // FRP (Fire Radiative Power): Typical VIIRS detection ranges from 1 to >150 MW
    let intensityScore = 0;
    const frp = event.frp || 0;
    if (frp >= 100) {
      intensityScore = 30;
      explainability.push(`Extreme thermal output (${frp.toFixed(1)} MW FRP) indicates high-energy combustion core [+30 pts]`);
    } else if (frp >= 50) {
      intensityScore = 24;
      explainability.push(`Elevated thermal radiation (${frp.toFixed(1)} MW FRP) indicates strong heat source [+24 pts]`);
    } else if (frp >= 20) {
      intensityScore = 16;
      explainability.push(`Moderate thermal output (${frp.toFixed(1)} MW FRP) [+16 pts]`);
    } else if (frp >= 5) {
      intensityScore = 10;
      explainability.push(`Low-to-moderate thermal radiation (${frp.toFixed(1)} MW FRP) [+10 pts]`);
    } else {
      intensityScore = 4;
      explainability.push(`Low thermal signature (${frp.toFixed(1)} MW FRP) [+4 pts]`);
    }

    // Brightness temperature check
    if (event.bright_ti4 && event.bright_ti4 > 360) {
      intensityScore = Math.min(30, intensityScore + 3);
      explainability.push(`VIIRS I-4 brightness temperature is extremely hot (${event.bright_ti4.toFixed(1)} K)`);
    }

    // 2. Persistence Score (0 - 25 pts)
    let persistenceScore = 0;
    if (isPersistent || clusterDetectionCount >= 3) {
      if (clusterDetectionCount >= 6) {
        persistenceScore = 25;
        explainability.push(`Heavy thermal persistence: recurrent detections across ${clusterDetectionCount} satellite observations [+25 pts]`);
      } else {
        persistenceScore = 18;
        explainability.push(`Persistent thermal source: confirmed across ${clusterDetectionCount} satellite overpasses [+18 pts]`);
      }
    } else if (clusterDetectionCount === 2) {
      persistenceScore = 10;
      explainability.push(`Repeated observation: 2 separate satellite passes in proximity [+10 pts]`);
    } else {
      persistenceScore = 0;
      explainability.push(`Single isolated observation with no prior recurrence [+0 pts]`);
    }

    // 3. Industrial Context Score (0 - 20 pts)
    let industrialScore = 0;
    if (osmContext && osmContext.verified && osmContext.distance_meters <= 3000) {
      const dist = osmContext.distance_meters;
      if (dist <= 300) {
        industrialScore = 20;
        explainability.push(`Direct intersection (${dist}m) with verified ${osmContext.feature_type}: "${osmContext.feature_name}" [+20 pts]`);
      } else if (dist <= 800) {
        industrialScore = 16;
        explainability.push(`High proximity (${dist}m) to OSM ${osmContext.feature_type}: "${osmContext.feature_name}" [+16 pts]`);
      } else if (dist <= 1500) {
        industrialScore = 10;
        explainability.push(`Intermediate proximity (${dist}m) to OSM ${osmContext.feature_type} [+10 pts]`);
      } else {
        industrialScore = 5;
        explainability.push(`Perimeter context (${dist}m) to industrial zone [+5 pts]`);
      }
    } else {
      industrialScore = 0;
      explainability.push(`No verified industrial or power facilities found within 3000m radius [+0 pts]`);
    }

    // 4. Historical Anomaly Score (0 - 15 pts)
    // Use only observable contextual signals available in the prototype; do not claim a statistical baseline without history.
    let anomalyScore = 0;
    if (clusterDetectionCount >= 3) {
      anomalyScore += 7;
      explainability.push(`Repeated nearby detections (${clusterDetectionCount} observations) raise the historical anomaly signal [+7 pts]`);
    } else if (clusterDetectionCount === 2) {
      anomalyScore += 4;
      explainability.push(`Two temporally separated nearby observations provide limited recurrence evidence [+4 pts]`);
    }

    if (event.daynight === 'N') {
      anomalyScore += 3;
      explainability.push(`Nighttime acquisition is an additional contextual signal; it is not proof of industrial activity [+3 pts]`);
    }

    if (frp > 40 && (!osmContext || !osmContext.verified)) {
      anomalyScore += 5;
      explainability.push(`High FRP without verified industrial context increases anomaly concern [+5 pts]`);
    } else if (frp > 30 && osmContext?.verified) {
      anomalyScore += 5;
      explainability.push(`High FRP near verified industrial context increases anomaly concern [+5 pts]`);
    }
    anomalyScore = Math.min(15, anomalyScore);

    // 5. Detection Confidence Score (0 - 10 pts)
    let confidenceScore = 0;
    const conf = event.confidence;
    if (conf >= 85) {
      confidenceScore = 10;
      explainability.push(`High NASA sensor confidence level (${conf}%) [+10 pts]`);
    } else if (conf >= 60) {
      confidenceScore = 7;
      explainability.push(`Nominal NASA sensor confidence level (${conf}%) [+7 pts]`);
    } else {
      confidenceScore = 3;
      explainability.push(`Low NASA sensor confidence level (${conf}%) [+3 pts]`);
    }

    // Sum Total (0 - 100)
    const rawTotal = intensityScore + persistenceScore + industrialScore + anomalyScore + confidenceScore;
    const riskScore = Math.min(100, Math.max(0, Math.round(rawTotal)));

    // Determine Risk Level
    let riskLevel: RiskLevel = 'LOW';
    if (riskScore >= 81) {
      riskLevel = 'CRITICAL';
    } else if (riskScore >= 61) {
      riskLevel = 'HIGH';
    } else if (riskScore >= 31) {
      riskLevel = 'MODERATE';
    } else {
      riskLevel = 'LOW';
    }

    // AI Classification (transparent rules)
    let classification: AIClassification = 'Unknown Thermal Anomaly';
    let primaryReason = '';

    if (isPersistent && industrialScore >= 10) {
      classification = 'Persistent Thermal Source';
      primaryReason = `Continuous thermal signature confirmed across repeated satellite passes directly adjacent to ${osmContext?.feature_name || 'industrial infrastructure'}.`;
    } else if (industrialScore >= 12 || (industrialScore >= 8 && riskScore >= 55)) {
      classification = 'Potential Industrial Thermal Event';
      primaryReason = `Elevated heat signature in direct spatial overlap with verified OSM industrial asset (${osmContext?.feature_name}).`;
    } else if (isPersistent) {
      classification = 'Persistent Thermal Source';
      primaryReason = `Repeated satellite thermal detections clustered at exact coordinates across time.`;
    } else if (event.daynight === 'D' && frp < 30 && (!osmContext || !osmContext.verified)) {
      classification = 'Agricultural Burn';
      primaryReason = `Low-to-moderate FRP observed during daylight in rural terrain without industrial structures.`;
    } else if (frp >= 35 && (!osmContext || !osmContext.verified)) {
      classification = 'Vegetation Fire';
      primaryReason = `High thermal radiative output in non-built environment suggestive of wild/scrub fire activity.`;
    } else {
      classification = 'Unknown Thermal Anomaly';
      primaryReason = `Thermal signature detected by VIIRS sensor with unclassified spatial surroundings.`;
    }

    const aiConfidence = Math.round(Math.min(95, 60 + (conf * 0.2) + (osmContext?.verified ? 15 : 0)));

    return {
      risk_score: riskScore,
      risk_level: riskLevel,
      classification,
      explainability,
      primary_reason: primaryReason,
      component_scores: {
        thermal_intensity: intensityScore,
        persistence: persistenceScore,
        industrial_context: industrialScore,
        historical_anomaly: anomalyScore,
        detection_confidence: confidenceScore,
      },
      ai_confidence: aiConfidence,
      engine_label: 'PROTOTYPE / RULE-ASSISTED AI',
    };
  }
}
