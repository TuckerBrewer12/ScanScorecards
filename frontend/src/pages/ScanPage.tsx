import { useScan } from "@/hooks/useScan";
import { ScanUploadStep } from "@/components/scan/ScanUploadStep";
import { ScanManualSetup } from "@/components/scan/ScanManualSetup";
import { ScanProcessing } from "@/components/scan/ScanProcessing";
import { ScanReviewStep } from "@/components/scan/ScanReviewStep";
import type { ScanState } from "@/types/scan";
import { initialScanState } from "@/types/scan";

interface ScanPageProps {
  userId: string;
  scanState: ScanState;
  setScanState: React.Dispatch<React.SetStateAction<ScanState>>;
}

export function ScanPage({ userId, scanState, setScanState }: ScanPageProps) {
  const scan = useScan(userId, scanState, setScanState);

  if (scan.step === "processing") {
    return <ScanProcessing scanMode={scan.scanMode} />;
  }

  if (scan.step === "review") {
    if (!scan.result) return null;
    return (
      <ScanReviewStep
        result={scan.result}
        scanMode={scan.scanMode}
        editedScores={scan.editedScores}
        editedNotes={scan.editedNotes}
        editedDate={scan.editedDate}
        editedTeeBox={scan.editedTeeBox}
        error={scan.error}
        preview={scan.preview}
        reviewCourseId={scan.reviewCourseId}
        reviewExternalCourseId={scan.reviewExternalCourseId}
        reviewCourseName={scan.reviewCourseName}
        saving={scan.saving}
        handicapIndex={scan.handicapIndex}
        reviewCourseQuery={scan.reviewCourseQuery}
        reviewCourseResults={scan.reviewCourseResults}
        reviewSearching={scan.reviewSearching}
        onReviewCourseQuery={scan.handleReviewCourseQuery}
        onSelectReviewCourse={scan.selectReviewCourse}
        onUpdate={scan.update}
        onScoreChange={scan.handleScoreChange}
        onGirChange={scan.handleGirChange}
        onSave={scan.handleSave}
        onReset={() => setScanState(initialScanState)}
        setReviewCourseQuery={scan.setReviewCourseQuery}
        setReviewCourseResults={scan.setReviewCourseResults}
        setScanState={setScanState}
      />
    );
  }

  // Upload step
  return (
    <>
      <ScanUploadStep
        scanMode={scan.scanMode}
        selectedCourseId={scan.selectedCourseId}
        selectedCourseName={scan.selectedCourseName}
        scoringFormat={scan.scoringFormat}
        file={scan.file}
        preview={scan.preview}
        error={scan.error}
        userContext={scan.userContext}
        dragOver={scan.dragOver}
        courseQuery={scan.courseQuery}
        courseResults={scan.courseResults}
        searching={scan.searching}
        loadingCourse={scan.loadingCourse}
        onModeChange={(mode) =>
          scan.update({
            scanMode: mode,
            selectedCourseId: null,
            selectedCourseName: null,
            scoringFormat: null,
            file: null,
            preview: null,
            manualCourseHoles: [],
            manualCourseTees: [],
          })
        }
        onCourseQuery={scan.handleCourseQuery}
        onSelectCourse={scan.selectCourse}
        onSelectCourseManual={scan.selectCourseManual}
        onClearCourse={() =>
          scan.scanMode === "fast"
            ? scan.update({
                selectedCourseId: null,
                selectedCourseName: null,
                scoringFormat: null,
                file: null,
                preview: null,
              })
            : scan.update({
                selectedCourseId: null,
                selectedCourseName: null,
              })
        }
        onScoringFormat={(fmt) => scan.update({ scoringFormat: fmt })}
        onFile={scan.handleFile}
        onDrop={scan.handleDrop}
        onDragOver={scan.setDragOver}
        onUpdate={scan.update}
        onExtract={scan.handleExtract}
        setCourseQuery={scan.setCourseQuery}
        setCourseResults={scan.setCourseResults}
      />

      {scan.scanMode === "manual" && (
        <ScanManualSetup
          selectedCourseId={scan.selectedCourseId}
          selectedCourseName={scan.selectedCourseName}
          manualCourseTees={scan.manualCourseTees}
          courseQuery={scan.courseQuery}
          courseResults={scan.courseResults}
          searching={scan.searching}
          loadingCourse={scan.loadingCourse}
          manualDate={scan.manualDate}
          manualTeeBox={scan.manualTeeBox}
          onCourseQuery={scan.handleCourseQuery}
          onSelectCourseManual={scan.selectCourseManual}
          onClearCourse={() =>
            scan.update({
              selectedCourseId: null,
              selectedCourseName: null,
              manualCourseHoles: [],
              manualCourseTees: [],
            })
          }
          onSetManualDate={scan.setManualDate}
          onSetManualTeeBox={scan.setManualTeeBox}
          onStartEntry={scan.handleStartEntry}
          onUpdate={scan.update}
          setCourseQuery={scan.setCourseQuery}
          setCourseResults={scan.setCourseResults}
        />
      )}
    </>
  );
}
