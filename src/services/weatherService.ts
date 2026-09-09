import type { Weather } from '@/types'

export interface GeocodeResult {
  lat: number
  lon: number
  city: string
}

export async function geocode(city: string): Promise<GeocodeResult> {
  const q = encodeURIComponent(city)
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=1&language=zh`)
  if (!res.ok) throw new Error(`地理编码失败 ${res.status}`)
  const data = (await res.json()) as { results?: { latitude: number; longitude: number; name: string }[] }
  if (!data.results || data.results.length === 0) throw new Error(`找不到城市:${city}`)
  const r = data.results[0]
  return { lat: r.latitude, lon: r.longitude, city: r.name }
}

export async function fetchWeather(location: string): Promise<Weather> {
  const { lat, lon, city } = await geocode(location)
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=1`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`天气请求失败 ${res.status}`)
  const data = (await res.json()) as {
    daily: {
      temperature_2m_max: number[]
      temperature_2m_min: number[]
      weather_code: number[]
    }
  }
  const daily = data.daily
  const code = daily.weather_code[0]
  return {
    location: city,
    tempHi: daily.temperature_2m_max[0],
    tempLo: daily.temperature_2m_min[0],
    condition: wmoToCondition(code),
    icon: String(code),
  }
}

function wmoToCondition(code: number): string {
  // 简化映射,实际可以更详细
  if (code === 0) return '晴'
  if (code <= 2) return '多云'
  if (code === 3) return '阴'
  if (code <= 49) return '雾'
  if (code <= 55 || code === 56 || code === 57) return '毛毛雨'
  if (code <= 67) return '雨'
  if (code <= 77) return '雪'
  if (code <= 82) return '阵雨'
  if (code <= 86) return '阵雪'
  if (code === 95) return '雷暴'
  if (code <= 99) return '雷暴伴冰雹'
  return '未知'
}
