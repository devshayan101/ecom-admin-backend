import Razorpay from 'razorpay';
import { config } from '../config/secrets';

let razorpay: Razorpay;

export function getRazorpay(keyId?: string, keySecret?: string): Razorpay {
    if (keyId && keySecret) {
        return new Razorpay({ key_id: keyId, key_secret: keySecret });
    }
    if (!razorpay) {
        razorpay = new Razorpay({
            key_id: config.razorpayKeyId,
            key_secret: config.razorpayKeySecret,
        });
    }
    return razorpay;
}
