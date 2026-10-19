# UK property suggestions

Moving collection/delivery, cleaning, airport pickup/drop-off and marketplace
collection addresses share the same address finder. Manual entry always works.
No lookup requests are sent until a key is configured; no demo addresses are
presented as real search results.

## Connect the address service

1. Create an account at https://ideal-postcodes.co.uk/ and obtain an address-search
   API key. Ask for UK Royal Mail PAF coverage and Multiple Residence coverage
   for individual flats where required. Coverage depends on the licensed data.
2. Copy `.env.example` to `.env.local`, and enter the key locally. Do not paste
   an account-management token into the app or commit credentials.
3. Restart Expo. For TestFlight builds, set the same variable in the EAS
   production environment before building.
4. Test a known postcode containing multiple flats, a house number and street,
   a building name, no results, offline operation and a disabled/exhausted key.

This EXPO_PUBLIC key is embedded in the app and is not secret. Configure usage
caps and available client restrictions in the provider account. A production
server gateway can keep a server key private and enforce per-user quotas. Never
expose the separate local administration backend to provide that gateway.

Selecting a suggestion resolves the full postal address and consumes a provider
lookup. Confirm the provider's current terms and costs in your account. Searches
are limited to the UK, wait 400 ms after typing, cancel superseded requests, and
time out after 8 seconds. Addresses are not logged or cached by this component.

References:
- https://docs.ideal-postcodes.co.uk/docs/api/find-address/
- https://docs.ideal-postcodes.co.uk/docs/api/resolve-address/
