import { describe, expect, it } from 'vitest';
import { formatKm, monthLabel, onTheRoadKm, roadTripKm } from '../../lib/side-quests';

describe('side quests helpers', () => {
    it('formats km with Indian grouping', () => {
        expect(formatKm(22100)).toBe('22,100');
        expect(formatKm(123456)).toBe('1,23,456');
        expect(formatKm(undefined)).toBe('0');
    });
    it('labels months', () => expect(monthLabel('2026-10')).toBe('Oct 2026'));
    it('counts the drive back for out-and-back trips but not loops', () => {
        const trips = [{ km: 407, stops: ['Bengaluru', 'Kodaikanal'] }, { km: 1589, stops: ['Bengaluru', 'Rameswaram', 'Bengaluru'] }];
        expect(roadTripKm(trips)).toBe(407 * 2 + 1589);
        expect(roadTripKm(null)).toBe(0);
    });
    it('totals tracked and earlier road km, rounded to 100', () => {
        expect(onTheRoadKm(16097, [{ km: 3006.5, stops: ['A', 'B'] }])).toBe(22100);
        expect(onTheRoadKm(undefined, [])).toBe(0);
    });
});
