export interface CarrierRateRequest {
    originPostcode: string;
    destPostcode: string;
    destCountry: string;
    destState: string;
    totalWeight: number; // in grams
    subtotal: number;
}

export interface CarrierRateResult {
    carrier: string;
    name: string;
    price: number;
    estimatedDays: number;
}

/**
 * Calculates rates dynamically for Delhivery using mock APIs/heuristics
 */
async function fetchDelhiveryRates(req: CarrierRateRequest, config: any): Promise<CarrierRateResult[]> {
    if (!config.enabled) return [];
    
    // Delhivery specializes in India domestic logistics
    if (req.destCountry.toLowerCase() !== 'india' && req.destCountry.toLowerCase() !== 'in') {
        return [];
    }

    const baseRate = 50;
    // Delhivery weight charge (e.g., ₹20 per 500g above 1kg)
    const extraWeight = Math.max(0, req.totalWeight - 1000);
    const weightCharge = Math.ceil(extraWeight / 500) * 20;
    
    return [
        {
            carrier: 'delhivery',
            name: 'Delhivery Surface',
            price: baseRate + weightCharge,
            estimatedDays: 5
        },
        {
            carrier: 'delhivery',
            name: 'Delhivery Express',
            price: baseRate + weightCharge + 40,
            estimatedDays: 2
        }
    ];
}

/**
 * Calculates rates dynamically for FedEx using mock APIs/heuristics
 */
async function fetchFedExRates(req: CarrierRateRequest, config: any): Promise<CarrierRateResult[]> {
    if (!config.enabled) return [];

    const isDomestic = req.destCountry.toLowerCase() === 'india' || req.destCountry.toLowerCase() === 'in';
    const baseRate = isDomestic ? 80 : 450;
    
    // FedEx weight charge
    const weightFactor = isDomestic ? 15 : 80;
    const weightCharge = Math.ceil(req.totalWeight / 1000) * weightFactor;

    return [
        {
            carrier: 'fedex',
            name: isDomestic ? 'FedEx Ground' : 'FedEx International Economy',
            price: baseRate + weightCharge,
            estimatedDays: isDomestic ? 4 : 7
        },
        {
            carrier: 'fedex',
            name: isDomestic ? 'FedEx 2Day' : 'FedEx International Priority',
            price: baseRate + weightCharge + (isDomestic ? 60 : 300),
            estimatedDays: isDomestic ? 2 : 3
        }
    ];
}

/**
 * Calculates rates dynamically for DHL using mock APIs/heuristics
 */
async function fetchDHLRates(req: CarrierRateRequest, config: any): Promise<CarrierRateResult[]> {
    if (!config.enabled) return [];

    const isDomestic = req.destCountry.toLowerCase() === 'india' || req.destCountry.toLowerCase() === 'in';
    const baseRate = isDomestic ? 120 : 600;
    const weightCharge = Math.ceil(req.totalWeight / 1000) * (isDomestic ? 25 : 120);

    return [
        {
            carrier: 'dhl',
            name: isDomestic ? 'DHL Express Domestic' : 'DHL Express Worldwide',
            price: baseRate + weightCharge,
            estimatedDays: isDomestic ? 1 : 4
        }
    ];
}

/**
 * Orchestrates fetching from all configured carriers
 */
export async function getCarrierRates(
    req: CarrierRateRequest,
    carriers: {
        delhivery: any;
        fedex: any;
        dhl: any;
    }
): Promise<CarrierRateResult[]> {
    try {
        const rates = await Promise.all([
            fetchDelhiveryRates(req, carriers.delhivery || {}),
            fetchFedExRates(req, carriers.fedex || {}),
            fetchDHLRates(req, carriers.dhl || {})
        ]);
        
        return rates.flat();
    } catch (error) {
        console.error('Error fetching carrier rates:', error);
        return [];
    }
}
