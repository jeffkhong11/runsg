// best-time.ts — Calculate and rank Singapore-specific running windows (T-060, T-061)

export interface RunningWindow {
  name: string
  timeRange: string
  score: 'best' | 'good' | 'avoid'
  tempC: number
  uvIndex: number
  advice: string
  reason: string
}

/**
 * Determine the best running windows based on current weather conditions
 * and typical Singapore diurnal weather patterns.
 */
export function getRunningWindows(
  currentTemp: number = 30,
  currentForecast: string = 'Fair',
  isRaining: boolean = false
): RunningWindow[] {
  // Normal diurnal patterns in Singapore scaled by current daily peak temp:
  const morningTemp = Math.max(24, Math.min(27, Math.round(currentTemp - 5)))
  const middayTemp = Math.max(30, Math.min(35, Math.round(currentTemp)))
  const eveningTemp = Math.max(27, Math.min(31, Math.round(currentTemp - 2)))
  const nightTemp = Math.max(25, Math.min(29, Math.round(currentTemp - 4)))

  const isRainForecast = /rain|shower|thunderstorm/i.test(currentForecast) || isRaining
  
  const windows: RunningWindow[] = [
    {
      name: 'Early Morning',
      timeRange: '06:00 – 08:30',
      score: 'best',
      tempC: morningTemp,
      uvIndex: 1,
      advice: 'Highly Recommended',
      reason: 'Coolest temperatures of the day and zero solar radiation. Perfect for long runs.'
    },
    {
      name: 'Mid-Day',
      timeRange: '10:00 – 16:00',
      score: 'avoid',
      tempC: middayTemp,
      uvIndex: 11,
      advice: 'Avoid Outdoor Runs',
      reason: 'Peak temperatures and extreme UV radiation. Risk of heatstroke and dehydration.'
    },
    {
      name: 'Late Afternoon / Sunset',
      timeRange: '17:30 – 19:30',
      score: 'good',
      tempC: eveningTemp,
      uvIndex: 0,
      advice: 'Good Conditions',
      reason: 'Solar heat fading and sun setting. Keep hydrated as pavement retains heat.'
    },
    {
      name: 'Night',
      timeRange: '19:30 – 23:00',
      score: 'best',
      tempC: nightTemp,
      uvIndex: 0,
      advice: 'Highly Recommended',
      reason: 'Fully shaded conditions. Perfect for urban route runs under street lighting.'
    }
  ]

  // Adjust scores if rain or haze is predicted/present
  return windows.map(w => {
    let score = w.score
    let reason = w.reason
    let advice = w.advice

    // 1. If currently raining or high chance of rain soon:
    if (isRainForecast) {
      if (w.name === 'Early Morning' || w.name === 'Late Afternoon / Sunset') {
        score = 'avoid'
        advice = 'Avoid'
        reason = 'Thundery showers or heavy rain forecasted. Pavement will be wet and slippery.'
      }
    }

    // 2. Adjust for current time of day:
    // Mark passed windows as "Completed" or adjust relevance if needed.
    return {
      ...w,
      score,
      advice,
      reason
    }
  })
}
