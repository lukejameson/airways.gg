import { z } from 'zod';

export const FlightBoardQuerySchema = z.object({
  date: z.string().optional(),
});

export const FlightDetailParamsSchema = z.object({
  id: z.string().regex(/^\d+$/).transform(Number),
});

export const SearchQuerySchema = z.object({
  q: z.string().optional(),
  date: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const AirportWeatherParamsSchema = z.object({
  code: z.string().min(3).max(4),
});

export const ApnsSubscribeSchema = z.object({
  deviceToken: z.string(),
  flightId: z.number(),
  flightCode: z.string(),
  flightDate: z.string(),
});

export const ApnsUnsubscribeSchema = z.object({
  deviceToken: z.string(),
  flightId: z.number(),
});

export const ApnsCheckQuerySchema = z.object({
  token: z.string(),
});

export type FlightBoardQuery = z.infer<typeof FlightBoardQuerySchema>;
export type FlightDetailParams = z.infer<typeof FlightDetailParamsSchema>;
export type SearchQuery = z.infer<typeof SearchQuerySchema>;
export type AirportWeatherParams = z.infer<typeof AirportWeatherParamsSchema>;
export type ApnsSubscribe = z.infer<typeof ApnsSubscribeSchema>;
export type ApnsUnsubscribe = z.infer<typeof ApnsUnsubscribeSchema>;
export type ApnsCheckQuery = z.infer<typeof ApnsCheckQuerySchema>;
