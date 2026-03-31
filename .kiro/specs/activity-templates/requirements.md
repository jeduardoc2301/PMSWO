# Requirements Document: Activity Templates Management

## Introduction

This feature enables users to create, manage, and apply reusable activity templates to projects in a PM SaaS application for consulting projects. Many consulting projects (such as AWS MAP Assessments) share 90% identical activities across different clients, with only 10% variation. Activity templates will significantly reduce the time needed to set up project activities by allowing users to define standard activity sets once and reuse them across multiple projects.

Templates are organization-level resources that include all work item fields (title, description, priority, estimated duration, activity type) and organize activities into phases for sequential execution. The feature includes a dedicated management interface for authorized users and an application interface accessible from within projects.

## Glossary

- **Activity_Template_System**: The complete system for creating, managing, and applying activity templates
- **Template**: A reusable collection of predefined activities organized into phases
- **Template_Manager**: The administrative interface for creating, editing, and deleting templates
- **Template_Applicator**: The interface within projects for selecting and applying templates
- **Activity**: A work item that will be created from a template (includes title, description, priority, estimated duration, activity type)
- **Phase**: A logical grouping of activities within a template that defines sequential execution order
- **Template_Category**: A classification label for organizing templates (e.g., "MAP Assessment", "Migration", "Optimization")
- **Batch_Creation**: The process of creating multiple work items simultaneously from a template
- **Template_Preview**: A read-only display of template contents before application
- **Authorized_User**: A user with ADMIN or PROJECT_MANAGER role
- **Organization**: A multi-tenant entity that owns templates and projects
- **Work_Item**: An existing system entity representing a task or activity in a project
- **Project**: An existing system entity representing a consulting engagement

## Requirements

### Requirement 1: Template Data Structure

**User Story:** As a project manager, I want templates to capture all necessary activity information, so that I can create complete work items without additional data entry.

#### Acceptance Criteria

1. THE Template SHALL include a unique identifier within the Organization
2. THE Template SHALL include a name field with maximum length of 255 characters
3. THE Template SHALL include a description field for explaining the template purpose
4. THE Template SHALL include a Template_Category field for classification
5. THE Template SHALL include a collection of one or more Phases
6. THE Phase SHALL include a name field with maximum length of 255 characters
7. THE Phase SHALL include an order field defining sequential position
8. THE Phase SHALL include a collection of one or more Activities
9. THE Activity SHALL include a title field with maximum length of 255 characters
10. THE Activity SHALL include a description field
11. THE Activity SHALL include a priority field (LOW, MEDIUM, HIGH, CRITICAL)
12. THE Activity SHALL include an estimated duration field in hours
13. THE Activity SHALL include an order field within the Phase
14. THE Template SHALL belong to exactly one Organization
15. THE Template SHALL include creation and modification timestamps

### Requirement 2: Template Management Access Control

**User Story:** As an administrator, I want to control who can manage templates, so that only authorized users can create or modify organizational templates.

#### Acceptance Criteria

1. WHEN an Authorized_User accesses the Template_Manager, THE Activity_Template_System SHALL display the template management interface
2. WHEN a user without ADMIN or PROJECT_MANAGER role attempts to access the Template_Manager, THE Activity_Template_System SHALL deny access with an authorization error
3. WHEN an Authorized_User attempts to create a template, THE Activity_Template_System SHALL verify the user belongs to the Organization
4. WHEN an Authorized_User attempts to edit a template, THE Activity_Template_System SHALL verify the template belongs to the user's Organization
5. WHEN an Authorized_User attempts to delete a template, THE Activity_Template_System SHALL verify the template belongs to the user's Organization

### Requirement 3: Template Creation

**User Story:** As a project manager, I want to create new activity templates, so that I can standardize common project structures.

#### Acceptance Criteria

1. WHEN an Authorized_User submits a new template with valid data, THE Template_Manager SHALL create the template in the Organization
2. WHEN an Authorized_User submits a template without a name, THE Template_Manager SHALL reject the submission with a validation error
3. WHEN an Authorized_User submits a template with a name exceeding 255 characters, THE Template_Manager SHALL reject the submission with a validation error
4. WHEN an Authorized_User submits a template without at least one Phase, THE Template_Manager SHALL reject the submission with a validation error
5. WHEN an Authorized_User submits a Phase without at least one Activity, THE Template_Manager SHALL reject the submission with a validation error
6. WHEN an Authorized_User submits an Activity without a title, THE Template_Manager SHALL reject the submission with a validation error
7. WHEN an Authorized_User submits an Activity with an invalid priority value, THE Template_Manager SHALL reject the submission with a validation error
8. WHEN an Authorized_User submits an Activity without an estimated duration, THE Template_Manager SHALL reject the submission with a validation error
9. WHEN a template is successfully created, THE Template_Manager SHALL assign creation and modification timestamps
10. WHEN a template is successfully created, THE Template_Manager SHALL display a success confirmation

### Requirement 4: Template Editing

**User Story:** As a project manager, I want to edit existing templates, so that I can improve and update standardized activity sets.

#### Acceptance Criteria

1. WHEN an Authorized_User requests to edit a template, THE Template_Manager SHALL display the template with all current data
2. WHEN an Authorized_User submits template modifications with valid data, THE Template_Manager SHALL update the template
3. WHEN an Authorized_User submits template modifications with invalid data, THE Template_Manager SHALL reject the submission with validation errors
4. WHEN a template is successfully updated, THE Template_Manager SHALL update the modification timestamp
5. WHEN a template is successfully updated, THE Template_Manager SHALL display a success confirmation
6. THE Template_Manager SHALL allow adding new Phases to an existing template
7. THE Template_Manager SHALL allow removing Phases from an existing template
8. THE Template_Manager SHALL allow adding new Activities to existing Phases
9. THE Template_Manager SHALL allow removing Activities from existing Phases
10. THE Template_Manager SHALL allow reordering Phases within a template
11. THE Template_Manager SHALL allow reordering Activities within a Phase

### Requirement 5: Template Deletion

**User Story:** As a project manager, I want to delete obsolete templates, so that users only see relevant and current templates.

#### Acceptance Criteria

1. WHEN an Authorized_User requests to delete a template, THE Template_Manager SHALL display a confirmation dialog
2. WHEN an Authorized_User confirms template deletion, THE Template_Manager SHALL permanently remove the template from the Organization
3. WHEN a template is successfully deleted, THE Template_Manager SHALL display a success confirmation
4. WHEN a template is successfully deleted, THE Template_Manager SHALL remove the template from all template lists

### Requirement 6: Template Listing and Search

**User Story:** As a user, I want to browse and search templates, so that I can find the appropriate template for my project.

#### Acceptance Criteria

1. WHEN a user accesses the template list, THE Activity_Template_System SHALL display all templates belonging to the user's Organization
2. THE Activity_Template_System SHALL display templates with name, description, Template_Category, and modification timestamp
3. WHEN a user filters templates by Template_Category, THE Activity_Template_System SHALL display only templates matching the selected category
4. WHEN a user searches templates by name, THE Activity_Template_System SHALL display only templates with names containing the search text
5. THE Activity_Template_System SHALL sort templates alphabetically by name by default
6. THE Activity_Template_System SHALL allow users to sort templates by modification timestamp

### Requirement 7: Template Viewing

**User Story:** As a user, I want to view template details, so that I can understand what activities will be created before applying the template.

#### Acceptance Criteria

1. WHEN a user selects a template, THE Activity_Template_System SHALL display the Template_Preview
2. THE Template_Preview SHALL display the template name and description
3. THE Template_Preview SHALL display all Phases in sequential order
4. THE Template_Preview SHALL display all Activities within each Phase in sequential order
5. THE Template_Preview SHALL display Activity title, description, priority, and estimated duration for each Activity
6. THE Template_Preview SHALL calculate and display the total estimated duration across all Activities
7. THE Template_Preview SHALL display the count of Activities in the template

### Requirement 8: Template Application Access Control

**User Story:** As a project member, I want to apply templates to my projects, so that I can quickly set up standard activity structures.

#### Acceptance Criteria

1. WHEN a user with WORK_ITEM_CREATE permission accesses a Project, THE Activity_Template_System SHALL display the option to apply templates
2. WHEN a user without WORK_ITEM_CREATE permission accesses a Project, THE Activity_Template_System SHALL not display the option to apply templates
3. WHEN a user attempts to apply a template to a Project, THE Activity_Template_System SHALL verify the user has WORK_ITEM_CREATE permission
4. WHEN a user attempts to apply a template to a Project, THE Activity_Template_System SHALL verify the Project belongs to the user's Organization

### Requirement 9: Template Selection for Application

**User Story:** As a project member, I want to select which template to apply, so that I can choose the appropriate activity structure for my project.

#### Acceptance Criteria

1. WHEN a user initiates template application within a Project, THE Template_Applicator SHALL display all templates belonging to the Organization
2. THE Template_Applicator SHALL allow filtering templates by Template_Category
3. THE Template_Applicator SHALL allow searching templates by name
4. WHEN a user selects a template, THE Template_Applicator SHALL display the Template_Preview
5. THE Template_Applicator SHALL allow the user to proceed with application after template selection

### Requirement 10: Activity Selection for Application

**User Story:** As a project member, I want to select which activities to create from a template, so that I can customize the template application to my project needs.

#### Acceptance Criteria

1. WHEN a user proceeds with template application, THE Template_Applicator SHALL display all Activities from the selected template
2. THE Template_Applicator SHALL display Activities organized by Phase
3. THE Template_Applicator SHALL allow the user to select individual Activities for creation
4. THE Template_Applicator SHALL allow the user to select all Activities in a Phase
5. THE Template_Applicator SHALL allow the user to select all Activities in the template
6. THE Template_Applicator SHALL display the count of selected Activities
7. THE Template_Applicator SHALL calculate and display the total estimated duration of selected Activities
8. WHEN a user attempts to proceed without selecting any Activities, THE Template_Applicator SHALL reject the action with a validation error

### Requirement 11: Date Assignment for Template Application

**User Story:** As a project member, I want to define start dates for template activities, so that the created work items have appropriate scheduling.

#### Acceptance Criteria

1. WHEN a user proceeds with Activity selection, THE Template_Applicator SHALL display a date assignment interface
2. THE Template_Applicator SHALL allow the user to specify a start date for the first Activity
3. WHEN a user specifies a start date, THE Template_Applicator SHALL calculate estimated end dates for all selected Activities based on estimated durations
4. THE Template_Applicator SHALL calculate subsequent Activity start dates sequentially within each Phase
5. THE Template_Applicator SHALL display the calculated start and end dates for all selected Activities in the preview
6. WHEN a user does not specify a start date, THE Template_Applicator SHALL use the current date as the default start date

### Requirement 12: Batch Work Item Creation

**User Story:** As a project member, I want to create all selected activities at once, so that I can efficiently populate my project with work items.

#### Acceptance Criteria

1. WHEN a user confirms template application, THE Template_Applicator SHALL create Work_Items for all selected Activities
2. THE Template_Applicator SHALL create Work_Items with title, description, priority, start date, and estimated end date from the Activity and calculated dates
3. THE Template_Applicator SHALL assign the Work_Items to the Project
4. THE Template_Applicator SHALL assign the Work_Items to the Organization
5. THE Template_Applicator SHALL set the Work_Item status to BACKLOG
6. THE Template_Applicator SHALL assign the Work_Item owner to the user applying the template
7. WHEN all Work_Items are successfully created, THE Template_Applicator SHALL display a success confirmation with the count of created Work_Items
8. WHEN Work_Item creation fails for any Activity, THE Template_Applicator SHALL roll back all Work_Item creations and display an error message
9. WHEN Work_Items are successfully created, THE Template_Applicator SHALL refresh the Project work items list to display the new Work_Items

### Requirement 13: Template Categories Management

**User Story:** As a project manager, I want to organize templates into categories, so that users can easily find relevant templates.

#### Acceptance Criteria

1. THE Template_Manager SHALL allow Authorized_Users to define Template_Categories for the Organization
2. THE Template_Manager SHALL allow Authorized_Users to assign a Template_Category to a template during creation
3. THE Template_Manager SHALL allow Authorized_Users to change the Template_Category of an existing template
4. THE Template_Manager SHALL allow Authorized_Users to create new Template_Categories
5. WHEN an Authorized_User creates a Template_Category with a name exceeding 100 characters, THE Template_Manager SHALL reject the creation with a validation error
6. THE Template_Manager SHALL prevent deletion of Template_Categories that are assigned to existing templates

### Requirement 14: Navigation Integration

**User Story:** As a user, I want to access template management from the main navigation, so that I can easily find and manage templates.

#### Acceptance Criteria

1. WHEN an Authorized_User views the main navigation menu, THE Activity_Template_System SHALL display a "Templates" menu item
2. WHEN a user without ADMIN or PROJECT_MANAGER role views the main navigation menu, THE Activity_Template_System SHALL not display the "Templates" menu item
3. WHEN an Authorized_User clicks the "Templates" menu item, THE Activity_Template_System SHALL navigate to the Template_Manager interface

### Requirement 15: Multi-Language Support

**User Story:** As a user, I want the template interface in my preferred language, so that I can work efficiently in Spanish or Portuguese.

#### Acceptance Criteria

1. THE Activity_Template_System SHALL display all user interface text in the user's selected language (Spanish or Portuguese)
2. THE Activity_Template_System SHALL display all validation error messages in the user's selected language
3. THE Activity_Template_System SHALL display all success confirmation messages in the user's selected language
4. THE Activity_Template_System SHALL store template data (names, descriptions, Activity details) in the language entered by the user
5. THE Activity_Template_System SHALL display template data in the language it was entered, regardless of the viewing user's language preference

### Requirement 16: Multi-Tenant Data Isolation

**User Story:** As an organization administrator, I want templates to be isolated to my organization, so that other organizations cannot access or modify our templates.

#### Acceptance Criteria

1. WHEN a user creates a template, THE Activity_Template_System SHALL associate the template with the user's Organization
2. WHEN a user lists templates, THE Activity_Template_System SHALL display only templates belonging to the user's Organization
3. WHEN a user attempts to view a template from another Organization, THE Activity_Template_System SHALL deny access with a not found error
4. WHEN a user attempts to edit a template from another Organization, THE Activity_Template_System SHALL deny access with a not found error
5. WHEN a user attempts to delete a template from another Organization, THE Activity_Template_System SHALL deny access with a not found error
6. WHEN a user applies a template to a Project, THE Activity_Template_System SHALL verify both the template and Project belong to the same Organization

### Requirement 17: Template Application Preview

**User Story:** As a project member, I want to preview what will be created before applying a template, so that I can verify the activities are appropriate for my project.

#### Acceptance Criteria

1. WHEN a user completes Activity selection and date assignment, THE Template_Applicator SHALL display a final preview
2. THE final preview SHALL display all selected Activities with calculated start and end dates
3. THE final preview SHALL display the Activity title, description, priority, and dates for each selected Activity
4. THE final preview SHALL organize Activities by Phase
5. THE final preview SHALL display the total count of Work_Items that will be created
6. THE final preview SHALL display the total estimated duration of all selected Activities
7. THE final preview SHALL allow the user to return to Activity selection to modify selections
8. THE final preview SHALL allow the user to return to date assignment to modify dates
9. THE final preview SHALL allow the user to confirm and proceed with Batch_Creation
10. THE final preview SHALL allow the user to cancel the template application

### Requirement 18: Template Validation

**User Story:** As a project manager, I want the system to validate template data, so that templates contain complete and correct information.

#### Acceptance Criteria

1. WHEN an Authorized_User saves a template, THE Template_Manager SHALL validate that all Phase order values are unique within the template
2. WHEN an Authorized_User saves a template, THE Template_Manager SHALL validate that all Activity order values are unique within each Phase
3. WHEN an Authorized_User saves a template, THE Template_Manager SHALL validate that estimated duration values are positive numbers
4. WHEN an Authorized_User saves a template, THE Template_Manager SHALL validate that priority values match the defined enumeration (LOW, MEDIUM, HIGH, CRITICAL)
5. WHEN validation fails, THE Template_Manager SHALL display all validation errors to the user
6. WHEN validation fails, THE Template_Manager SHALL not save the template

### Requirement 19: Template Usage Tracking

**User Story:** As an administrator, I want to track template usage, so that I can understand which templates are valuable to the organization.

#### Acceptance Criteria

1. WHEN a user successfully applies a template to a Project, THE Activity_Template_System SHALL increment the usage count for the template
2. WHEN a user successfully applies a template to a Project, THE Activity_Template_System SHALL record the application timestamp
3. THE Template_Manager SHALL display the usage count for each template in the template list
4. THE Template_Manager SHALL display the last application timestamp for each template
5. THE Template_Manager SHALL allow sorting templates by usage count
6. THE Template_Manager SHALL allow sorting templates by last application timestamp

### Requirement 20: Error Handling and User Feedback

**User Story:** As a user, I want clear error messages when operations fail, so that I can understand and resolve issues.

#### Acceptance Criteria

1. WHEN a template operation fails due to validation errors, THE Activity_Template_System SHALL display specific field-level error messages
2. WHEN a template operation fails due to authorization errors, THE Activity_Template_System SHALL display a message indicating insufficient permissions
3. WHEN a template operation fails due to network errors, THE Activity_Template_System SHALL display a message indicating connection issues
4. WHEN a template operation fails due to server errors, THE Activity_Template_System SHALL display a generic error message and log detailed error information
5. WHEN a template operation succeeds, THE Activity_Template_System SHALL display a success confirmation message
6. THE Activity_Template_System SHALL automatically dismiss success messages after 5 seconds
7. THE Activity_Template_System SHALL require user action to dismiss error messages
