import {
  DateRange,
  FilterValue,
  SelectedFilterValue,
} from "@/app/(app)/environments/[environmentId]/components/ResponseFilterContext";
import {
  OptionsType,
  QuestionOptions,
} from "@/app/(app)/environments/[environmentId]/surveys/[surveyId]/components/QuestionsComboBox";
import { QuestionFilterOptions } from "@/app/(app)/environments/[environmentId]/surveys/[surveyId]/components/ResponseFilter";
import { isWithinInterval } from "date-fns";

import { TResponse, TResponseFilterCriteria, TSurveyPersonAttributes } from "@formbricks/types/responses";
import { TSurveyQuestionType } from "@formbricks/types/surveys";
import { TSurvey } from "@formbricks/types/surveys";
import { TTag } from "@formbricks/types/tags";

const conditionOptions = {
  openText: ["is"],
  multipleChoiceSingle: ["Includes either"],
  multipleChoiceMulti: ["Includes all", "Includes either"],
  nps: ["Is equal to", "Is less than", "Is more than", "Submitted", "Skipped"],
  rating: ["Is equal to", "Is less than", "Is more than", "Submitted", "Skipped"],
  cta: ["is"],
  tags: ["is"],
  userAttributes: ["Equals", "Not equals"],
  consent: ["is"],
};
const filterOptions = {
  openText: ["Filled out", "Skipped"],
  rating: ["1", "2", "3", "4", "5"],
  nps: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
  cta: ["Clicked", "Dismissed"],
  tags: ["Applied", "Not applied"],
  consent: ["Accepted", "Dismissed"],
};

// creating the options for the filtering to be selected there are three types questions, attributes and tags
export const generateQuestionAndFilterOptions = (
  survey: TSurvey,
  environmentTags: TTag[] | undefined,
  attributes: TSurveyPersonAttributes
): {
  questionOptions: QuestionOptions[];
  questionFilterOptions: QuestionFilterOptions[];
} => {
  let questionOptions: any = [];
  let questionFilterOptions: any = [];

  let questionsOptions: any = [];

  survey.questions.forEach((q) => {
    if (Object.keys(conditionOptions).includes(q.type)) {
      questionsOptions.push({
        label: q.headline,
        questionType: q.type,
        type: OptionsType.QUESTIONS,
        id: q.id,
      });
    }
  });
  questionOptions = [...questionOptions, { header: OptionsType.QUESTIONS, option: questionsOptions }];
  survey.questions.forEach((q) => {
    if (Object.keys(conditionOptions).includes(q.type)) {
      if (
        q.type === TSurveyQuestionType.MultipleChoiceMulti ||
        q.type === TSurveyQuestionType.MultipleChoiceSingle
      ) {
        questionFilterOptions.push({
          type: q.type,
          filterOptions: conditionOptions[q.type],
          filterComboBoxOptions: q?.choices ? q?.choices?.map((c) => c?.label) : [""],
          id: q.id,
        });
      } else {
        questionFilterOptions.push({
          type: q.type,
          filterOptions: conditionOptions[q.type],
          filterComboBoxOptions: filterOptions[q.type],
          id: q.id,
        });
      }
    }
  });

  const tagsOptions = environmentTags?.map((t) => {
    return { label: t.name, type: OptionsType.TAGS, id: t.id };
  });
  if (tagsOptions && tagsOptions?.length > 0) {
    questionOptions = [...questionOptions, { header: OptionsType.TAGS, option: tagsOptions }];
    environmentTags?.forEach((t) => {
      questionFilterOptions.push({
        type: "Tags",
        filterOptions: conditionOptions.tags,
        filterComboBoxOptions: filterOptions.tags,
        id: t.id,
      });
    });
  }

  if (attributes) {
    questionOptions = [
      ...questionOptions,
      {
        header: OptionsType.ATTRIBUTES,
        option: Object.keys(attributes).map((a) => {
          return { label: a, type: OptionsType.ATTRIBUTES, id: a };
        }),
      },
    ];
    Object.keys(attributes).forEach((a) => {
      questionFilterOptions.push({
        type: "Attributes",
        filterOptions: conditionOptions.userAttributes,
        filterComboBoxOptions: attributes[a],
        id: a,
      });
    });
  }

  return { questionOptions: [...questionOptions], questionFilterOptions: [...questionFilterOptions] };
};

// get the formatted filter expression to fetch filtered responses
export const getFormattedFilters = (
  selectedFilter: SelectedFilterValue,
  dateRange: DateRange
): TResponseFilterCriteria => {
  const filters: TResponseFilterCriteria = {};

  const [questions, tags, attributes] = selectedFilter.filter.reduce(
    (result: [FilterValue[], FilterValue[], FilterValue[]], filter) => {
      if (filter.questionType?.type === "Questions") {
        result[0].push(filter);
      } else if (filter.questionType?.type === "Tags") {
        result[1].push(filter);
      } else if (filter.questionType?.type === "Attributes") {
        result[2].push(filter);
      }
      return result;
    },
    [[], [], []]
  );

  // for completed responses
  if (selectedFilter.onlyComplete) {
    filters["finished"] = true;
  }

  // for date range responses
  if (dateRange.from && dateRange.to) {
    filters["createdAt"] = {
      min: dateRange.from,
      max: dateRange.to,
    };
  }

  // for tags
  if (tags.length) {
    filters["tags"] = {
      applied: [],
      notApplied: [],
    };
    tags.forEach((tag) => {
      if (tag.filterType.filterComboBoxValue === "Applied") {
        filters.tags?.applied?.push(tag.questionType.label ?? "");
      } else {
        filters.tags?.notApplied?.push(tag.questionType.label ?? "");
      }
    });
  }

  // for questions
  if (questions.length) {
    questions.forEach(({ filterType, questionType }) => {
      if (!filters.data) filters.data = {};
      switch (questionType.questionType) {
        case TSurveyQuestionType.OpenText: {
          if (filterType.filterComboBoxValue === "Filled out") {
            filters.data[questionType.id ?? ""] = {
              op: "submitted",
            };
          } else if (filterType.filterComboBoxValue === "Skipped") {
            filters.data[questionType.id ?? ""] = {
              op: "skipped",
            };
          }
        }
        case TSurveyQuestionType.MultipleChoiceSingle:
        case TSurveyQuestionType.MultipleChoiceMulti: {
          if (filterType.filterValue === "Includes either") {
            filters.data[questionType.id ?? ""] = {
              op: "includesOne",
              value: filterType.filterComboBoxValue as string[],
            };
          } else if (filterType.filterValue === "Includes all") {
            filters.data[questionType.id ?? ""] = {
              op: "includesAll",
              value: filterType.filterComboBoxValue as string[],
            };
          }
        }
        case TSurveyQuestionType.NPS:
        case TSurveyQuestionType.Rating: {
          if (filterType.filterValue === "Is equal to") {
            filters.data[questionType.id ?? ""] = {
              op: "equals",
              value: parseInt(filterType.filterComboBoxValue as string),
            };
          } else if (filterType.filterValue === "Is less than") {
            filters.data[questionType.id ?? ""] = {
              op: "lessThan",
              value: parseInt(filterType.filterComboBoxValue as string),
            };
          } else if (filterType.filterValue === "Is more than") {
            filters.data[questionType.id ?? ""] = {
              op: "greaterThan",
              value: parseInt(filterType.filterComboBoxValue as string),
            };
          } else if (filterType.filterValue === "Submitted") {
            filters.data[questionType.id ?? ""] = {
              op: "submitted",
            };
          } else if (filterType.filterValue === "Skipped") {
            filters.data[questionType.id ?? ""] = {
              op: "skipped",
            };
          }
        }
        case TSurveyQuestionType.CTA: {
          if (filterType.filterComboBoxValue === "Clicked") {
            filters.data[questionType.id ?? ""] = {
              op: "clicked",
            };
          } else if (filterType.filterComboBoxValue === "Dismissed") {
            filters.data[questionType.id ?? ""] = {
              op: "skipped",
            };
          }
        }
        case TSurveyQuestionType.Consent: {
          if (filterType.filterComboBoxValue === "Accepted") {
            filters.data[questionType.id ?? ""] = {
              op: "accepted",
            };
          } else if (filterType.filterComboBoxValue === "Dismissed") {
            filters.data[questionType.id ?? ""] = {
              op: "skipped",
            };
          }
        }
      }
    });
  }

  if (attributes.length) {
    attributes.forEach(({ filterType, questionType }) => {
      if (!filters.personAttributes) filters.personAttributes = {};
      if (filterType.filterValue === "Equals") {
        filters.personAttributes[questionType.label ?? ""] = {
          op: "equals",
          value: filterType.filterComboBoxValue as string,
        };
      } else if (filterType.filterValue === "Not equals") {
        filters.personAttributes[questionType.label ?? ""] = {
          op: "notEquals",
          value: filterType.filterComboBoxValue as string,
        };
      }
    });
  }

  return filters;
};

// get the filtered responses
export const getFilterResponses = (
  responses: TResponse[],
  selectedFilter: SelectedFilterValue,
  survey: TSurvey,
  dateRange: DateRange
) => {
  // added the question on the response object to filter out the responses which has been selected
  let toBeFilterResponses = responses.map((r) => {
    return {
      ...r,
      questions: survey.questions.map((q) => {
        if (q.id in r.data) {
          return q;
        }
      }),
    };
  });

  // filtering the responses according to the value selected
  selectedFilter.filter.forEach((filter) => {
    if (filter.questionType?.type === "Questions") {
      switch (filter.questionType?.questionType) {
        case TSurveyQuestionType.Consent:
          toBeFilterResponses = toBeFilterResponses.filter((response) => {
            const questionID = response.questions.find(
              (q) => q?.type === TSurveyQuestionType.Consent && q?.id === filter?.questionType?.id
            )?.id;
            if (filter?.filterType?.filterComboBoxValue) {
              if (questionID) {
                const responseValue = response.data[questionID];
                if (filter?.filterType?.filterComboBoxValue === "Accepted") {
                  return responseValue === "accepted";
                }
                if (filter?.filterType?.filterComboBoxValue === "Dismissed") {
                  return responseValue === "dismissed";
                }
                return true;
              }
              return false;
            }
            return true;
          });
          break;
        case TSurveyQuestionType.OpenText:
          toBeFilterResponses = toBeFilterResponses.filter((response) => {
            const questionID = response.questions.find(
              (q) => q?.type === TSurveyQuestionType.OpenText && q?.id === filter?.questionType?.id
            )?.id;
            if (filter?.filterType?.filterComboBoxValue) {
              if (questionID) {
                const responseValue = response.data[questionID];
                if (filter?.filterType?.filterComboBoxValue === "Filled out") {
                  return typeof responseValue === "string" && responseValue.trim() !== "" ? true : false;
                }
                if (filter?.filterType?.filterComboBoxValue === "Skipped") {
                  return typeof responseValue === "string" && responseValue.trim() === "" ? true : false;
                }
                return true;
              }
              return false;
            }
            return true;
          });
          break;
        case TSurveyQuestionType.CTA:
          toBeFilterResponses = toBeFilterResponses.filter((response) => {
            const questionID = response.questions.find(
              (q) => q?.type === TSurveyQuestionType.CTA && q?.id === filter?.questionType?.id
            )?.id;
            if (filter?.filterType?.filterComboBoxValue) {
              if (questionID) {
                const responseValue = response.data[questionID];
                if (filter?.filterType?.filterComboBoxValue === "Clicked") {
                  return responseValue === "clicked";
                }
                if (filter?.filterType?.filterComboBoxValue === "Dismissed") {
                  return responseValue === "dismissed";
                }
                return true;
              }
              return false;
            }
            return true;
          });
          break;
        case TSurveyQuestionType.MultipleChoiceMulti:
          toBeFilterResponses = toBeFilterResponses.filter((response) => {
            const question = response.questions.find(
              (q) => q?.type === TSurveyQuestionType.MultipleChoiceMulti && q?.id === filter?.questionType?.id
            );
            if (filter?.filterType?.filterComboBoxValue) {
              if (question) {
                const responseValue = response.data[question.id];
                const filterValue = filter?.filterType?.filterComboBoxValue;
                if (Array.isArray(responseValue) && Array.isArray(filterValue) && filterValue.length > 0) {
                  //@ts-expect-error
                  const updatedResponseValue = question?.choices
                    ? //@ts-expect-error
                      matchAndUpdateArray([...question?.choices], [...responseValue])
                    : responseValue;
                  if (filter?.filterType?.filterValue === "Includes all") {
                    return filterValue.every((item) => updatedResponseValue.includes(item));
                  }
                  if (filter?.filterType?.filterValue === "Includes either") {
                    return filterValue.some((item) => updatedResponseValue.includes(item));
                  }
                }
                return true;
              }
              return false;
            }
            return true;
          });
          break;
        case TSurveyQuestionType.MultipleChoiceSingle:
          toBeFilterResponses = toBeFilterResponses.filter((response) => {
            const questionID = response.questions.find(
              (q) =>
                q?.type === TSurveyQuestionType.MultipleChoiceSingle && q?.id === filter?.questionType?.id
            )?.id;
            if (filter?.filterType?.filterComboBoxValue) {
              if (questionID) {
                const responseValue = response.data[questionID];
                const filterValue = filter?.filterType?.filterComboBoxValue;
                if (
                  filter?.filterType?.filterValue === "Includes either" &&
                  Array.isArray(filterValue) &&
                  filterValue.length > 0 &&
                  typeof responseValue === "string"
                ) {
                  return filterValue.includes(responseValue);
                }
                return true;
              }
              return false;
            }
            return true;
          });
          break;
        case TSurveyQuestionType.NPS:
          toBeFilterResponses = toBeFilterResponses.filter((response) => {
            const questionID = response.questions.find(
              (q) => q?.type === TSurveyQuestionType.NPS && q?.id === filter?.questionType?.id
            )?.id;
            const responseValue = questionID ? response.data[questionID] : undefined;
            const filterValue =
              filter?.filterType?.filterComboBoxValue &&
              typeof filter?.filterType?.filterComboBoxValue === "string" &&
              parseInt(filter?.filterType?.filterComboBoxValue);
            if (filter?.filterType?.filterValue === "Submitted") {
              return responseValue ? true : false;
            }
            if (filter?.filterType?.filterValue === "Skipped") {
              return responseValue === "dismissed";
            }
            if (!questionID && typeof filterValue === "number") {
              return false;
            }
            if (questionID && typeof responseValue === "number" && typeof filterValue === "number") {
              if (filter?.filterType?.filterValue === "Is equal to") {
                return responseValue === filterValue;
              }
              if (filter?.filterType?.filterValue === "Is more than") {
                return responseValue > filterValue;
              }
              if (filter?.filterType?.filterValue === "Is less than") {
                return responseValue < filterValue;
              }
            }
            return true;
          });
          break;
        case TSurveyQuestionType.Rating:
          toBeFilterResponses = toBeFilterResponses.filter((response) => {
            const questionID = response.questions.find(
              (q) => q?.type === TSurveyQuestionType.Rating && q?.id === filter?.questionType?.id
            )?.id;
            const responseValue = questionID ? response.data[questionID] : undefined;
            const filterValue =
              filter?.filterType?.filterComboBoxValue &&
              typeof filter?.filterType?.filterComboBoxValue === "string" &&
              parseInt(filter?.filterType?.filterComboBoxValue);
            if (filter?.filterType?.filterValue === "Submitted") {
              return responseValue ? true : false;
            }
            if (filter?.filterType?.filterValue === "Skipped") {
              return responseValue === "dismissed";
            }
            if (!questionID && typeof filterValue === "number") {
              return false;
            }
            if (questionID && typeof responseValue === "number" && typeof filterValue === "number") {
              if (filter?.filterType?.filterValue === "Is equal to") {
                return responseValue === filterValue;
              }
              if (filter?.filterType?.filterValue === "Is more than") {
                return responseValue > filterValue;
              }
              if (filter?.filterType?.filterValue === "Is less than") {
                return responseValue < filterValue;
              }
            }
            return true;
          });
          break;
      }
    }
    if (filter.questionType?.type === "Tags") {
      toBeFilterResponses = toBeFilterResponses.filter((response) => {
        const tagNames = response.tags.map((tag) => tag.name);
        if (filter?.filterType?.filterComboBoxValue) {
          if (filter?.filterType?.filterComboBoxValue === "Applied") {
            if (filter?.questionType?.label) return tagNames.includes(filter.questionType.label);
          }
          if (filter?.filterType?.filterComboBoxValue === "Not applied") {
            if (filter?.questionType?.label) return !tagNames.includes(filter?.questionType?.label);
          }
        }
        return true;
      });
    }
    if (filter.questionType?.type === "Attributes") {
      toBeFilterResponses = toBeFilterResponses.filter((response) => {
        if (filter?.questionType?.label && filter?.filterType?.filterComboBoxValue) {
          const attributes =
            response.personAttributes && Object.keys(response.personAttributes).length > 0
              ? response.personAttributes
              : null;
          if (attributes && attributes.hasOwnProperty(filter?.questionType?.label)) {
            if (filter?.filterType?.filterValue === "Equals") {
              return attributes[filter?.questionType?.label] === filter?.filterType?.filterComboBoxValue;
            }
            if (filter?.filterType?.filterValue === "Not equals") {
              return attributes[filter?.questionType?.label] !== filter?.filterType?.filterComboBoxValue;
            }
          } else {
            return false;
          }
        }
        return true;
      });
    }
  });

  // filtering for the responses which is completed
  toBeFilterResponses = toBeFilterResponses.filter((r) => (selectedFilter.onlyComplete ? r.finished : true));

  // filtering the data according to the dates
  if (dateRange?.from !== undefined && dateRange?.to !== undefined) {
    toBeFilterResponses = toBeFilterResponses.filter((r) =>
      isWithinInterval(r.createdAt, { start: dateRange.from!, end: dateRange.to! })
    );
  }

  return toBeFilterResponses;
};

// get the today date with full hours
export const getTodayDate = (): Date => {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
};

// function update the response value of question multiChoiceSelect
function matchAndUpdateArray(choices: any, responseValue: string[]) {
  const choicesArray = choices.map((obj) => obj.label);

  responseValue.forEach((element, index) => {
    // Check if the element is present in the choices
    if (choicesArray.includes(element)) {
      return; // No changes needed, move to the next iteration
    }

    // Check if the choices has 'Other'
    if (choicesArray.includes("Other") && !choicesArray.includes(element)) {
      responseValue[index] = "Other"; // Update the element to 'Other'
    }
  });

  return responseValue;
}
