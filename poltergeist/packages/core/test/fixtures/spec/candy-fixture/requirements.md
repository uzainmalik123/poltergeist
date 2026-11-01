# Requirements Document

## Introduction

A tiny spec for the Candy-shaped test fixture (`test/scout/candy-fixture.ts`), used by F05's Done-when test until the real Candy Swap spec exists (F10, KI-34).

## Requirements

### Requirement 1: Claiming candy

**User Story:** As a candy trader, I want to claim candy from the market, so that it becomes mine.

#### Acceptance Criteria

1. WHEN a user clicks Claim Sour Skulls twice, THE Market SHALL record only one claim.
2. IF two sessions claim Sour Skulls at the same moment, THEN THE Market SHALL accept only one of them.
3. THE Market SHALL show how many candies are left in the market status.

### Requirement 2: Proposing trades

**User Story:** As a candy trader, I want to propose a trade, so that I can swap candy I don't want.

#### Acceptance Criteria

1. IF a user proposes a trade with an empty offer, THEN THE Trade_Form SHALL show an error in the trade status.
2. WHEN a user writes a note on a trade, THE Trade_Form SHALL accept any text in the note.
