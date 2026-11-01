# Requirements Document

## Introduction

Candy Swap is a small marketplace where people list spare candy and swap it with each other. This is a hand-written draft in Kiro's format, used as a Spec Reader fixture until the real Kiro-generated spec exists (F10).

## Glossary

- **Swap_Offer:** a proposal to trade one listing for another.

## Requirements

### Requirement 1: Sign in

**User Story:** As a candy trader, I want to sign in, so that my listings and offers are mine.

#### Acceptance Criteria

1. WHEN a user submits a valid email and password, THE Auth_Service SHALL start a session and redirect to the dashboard.
2. IF the password is wrong, THEN THE Auth_Service SHALL show an error and SHALL NOT reveal whether the email exists.
3. WHILE a user is signed in, THE Header SHALL show their display name.

### Requirement 2: Listings

**User Story:** As a candy trader, I want to list candy, so that others can offer swaps.

#### Acceptance Criteria

1. WHEN a user submits the listing form, THE Listing_Service SHALL create exactly one listing.
2. IF the quantity is not a whole number between 1 and 99, THEN THE Listing_Form SHALL reject it with a field error.
3. THE Listing_Page SHALL show the candy name, quantity and owner.

### Requirement 3: Swap offers

**User Story:** As a candy trader, I want to offer a swap, so that I can trade candy I don't want.

#### Acceptance Criteria

1. WHEN a user offers a swap on another user's listing, THE Swap_Service SHALL create a pending Swap_Offer.
2. IF a user offers a swap on their own listing, THEN THE Swap_Service SHALL refuse it.

### Requirement 4: Accepting offers

**User Story:** As a listing owner, I want to accept one offer, so that the swap happens once.

#### Acceptance Criteria

1. WHEN the owner accepts a Swap_Offer, THE Swap_Service SHALL mark it accepted and decline every other pending offer on that listing.
2. IF two offers on one listing are accepted at the same time, THEN THE Swap_Service SHALL accept only one of them.

### Requirement 5: Inventory

**User Story:** As a candy trader, I want my inventory to stay correct, so that I never trade candy I don't have.

#### Acceptance Criteria

1. WHEN a swap completes, THE Inventory SHALL move the quantities between both users in one transaction.
2. WHERE the "low stock" setting is enabled, THE Dashboard SHALL warn when a listing has fewer than 3 items.
3. Inventory numbers never go negative.
