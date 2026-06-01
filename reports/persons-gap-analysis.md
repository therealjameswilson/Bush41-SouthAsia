# Persons Gap Analysis - Bush41 South Asia

Checked: 2026-06-01

## Baseline

- Current persons list: 72 entries.
- Scope implemented: Bush administration principals, U.S. South Asia-facing officials, source-context officers, and foreign principals named in the confirmed chronology.
- Agencies represented: AID, Defense, Foreign government, NSC, State, Treasury, USTR, White House.
- Source checked: local `Bush Comprehensive Names List.docx`, confirmed chronology participant metadata, and compiler persons-authority audit.

## Resolved Since Prior Pass

| Gap | Current status | Evidence |
| --- | --- | --- |
| Foreign principals absent from Persons. | Resolved for confirmed chronology participants. | `compiler-persons-authority.md` reports 18 foreign-principal participant labels with authority entries. |
| State South Asia desk coverage too thin. | Partly resolved as context authority. | The list now includes Abington, Borg, Butcher, Carty, Flaten, Griffin, Warren, and related post/desk officers. |
| NSC Near East/South Asia staff underrepresented. | Partly resolved as context authority. | The list now includes Haass, Charles, Tahir-Kheli, Riedel, and Welch. |
| Afghanistan operational actors missing. | Partly resolved as context authority. | The list now includes Tomsen, Greene, Ealum, Feierstein, McWilliams, and related Afghanistan/post officers. |
| Ambassador/post coverage incomplete. | Partly resolved as context authority. | The list now includes Oakley, Platt, Monjo, Pickering, Milam, De Pree, Bloch, Frank, Creekmore, Brill, and others. |

## Residual Risks

| Risk | Gap | Evidence | Next action |
| --- | --- | --- | --- |
| High | Context-only authority entries may overfill the published Persons list if final document selection narrows. | 52 authority entries are not directly named in confirmed chronology participant metadata. | Retain them for now, then remove or annotate after final selected documents, source notes, and annotations are fixed. |
| High | Institutional participants must not be treated as persons. | Deputies Committee and National Security Council appear as participant labels in 29 records. | Keep them in chronology metadata; omit from Persons unless the editor requests a body note. |
| Medium | Foreign-principal role/date wording still needs final spot-check. | The authority audit resolves all 18 foreign-principal participant labels but does not replace final editorial verification. | Check each foreign entry against the selected document text or final annotation package. |
| Medium | Nuclear, economic, AID, USIA, and refugee officials may need additions if new documents are promoted. | India economic/trade and Pakistan nuclear lanes remain open in the chapter matrix. | Re-run the persons authority audit after promoting Gates, Cheney, WHORM, State, or embassy files. |

## Immediate Verification Queue

1. Confirm foreign-principal entries against selected document text: Bhutto, Gandhi, Ghulam Ishaq Khan, Nawaz Sharif, Rao, Venkataraman, Khaleda Zia, Ershad, Mojaddedi, and related non-South Asian interlocutors.
2. Keep Deputies Committee and National Security Council as body labels, not Persons entries.
3. Review context-only U.S. officials after final document promotion: State desk officers, NSC NESA staff, Afghanistan field officers, South Asia ambassadors, and economic/nuclear-policy officers.
4. Re-run `node scripts/generate-compiler-worksheet.js` after any Persons or chronology change so `compiler-persons-authority.md` and CSV remain current.

## Selection Decision

The Persons page is now a usable compiler authority list rather than only a Bush administration principal list. It is not publication-final: it deliberately preserves source-context officials until document selection proves who belongs in the final FRUS Persons apparatus.
