-- Splits the CDM 2015 works-type question: CDM's Principal Designer duty
-- triggers on "more than one contractor" independently of whether the
-- building itself is modified, so DIRECT_REPLACEMENT is split into a
-- single-contractor and a multiple-contractor variant.
ALTER TYPE "CdmWorksType" RENAME VALUE 'DIRECT_REPLACEMENT' TO 'DIRECT_REPLACEMENT_SINGLE_CONTRACTOR';
ALTER TYPE "CdmWorksType" ADD VALUE 'DIRECT_REPLACEMENT_MULTIPLE_CONTRACTORS';
