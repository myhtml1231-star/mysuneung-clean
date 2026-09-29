import * as L from '../src/learning-core.mjs';
import * as S from '../src/study-core.mjs';
import {mathStudyMethod} from './math-methods.mjs';
window.CBTLearning=L;window.CBTStudy={...S,studyMethod:mathStudyMethod};window.CBTEBS={questions:{},coverage:[]};
