package integrations

type CLIProvider struct {
	ID           string
	Name         string
	Binary       string
	AuthCommands []string
	Description  string
	Category     string
}

var CLIProviders = []CLIProvider{
	{ID: "github", Name: "GitHub", Binary: "gh", AuthCommands: []string{"gh auth login"}, Description: "Repositories and project metadata through the GitHub CLI.", Category: "Source Control"},
	{ID: "gitlab", Name: "GitLab", Binary: "glab", AuthCommands: []string{"glab auth login"}, Description: "Repositories and pipelines through the GitLab CLI.", Category: "Source Control"},
	{ID: "aws", Name: "AWS", Binary: "aws", AuthCommands: []string{"aws configure sso", "aws sso login"}, Description: "Resources through the AWS CLI SSO flow.", Category: "Cloud"},
	{ID: "google-cloud", Name: "Google Cloud", Binary: "gcloud", AuthCommands: []string{"gcloud auth login"}, Description: "Projects and resources through the Google Cloud CLI.", Category: "Cloud"},
	{ID: "azure", Name: "Azure", Binary: "az", AuthCommands: []string{"az login"}, Description: "Subscriptions and resources through the Azure CLI.", Category: "Cloud"},
	{ID: "vercel", Name: "Vercel", Binary: "vercel", AuthCommands: []string{"vercel login"}, Description: "Projects and deployments through the Vercel CLI.", Category: "Deployment"},
	{ID: "supabase", Name: "Supabase", Binary: "supabase", AuthCommands: []string{"supabase login"}, Description: "Local project links through the Supabase CLI.", Category: "Databases"},
	{ID: "terraform", Name: "Terraform", Binary: "terraform", AuthCommands: []string{"terraform login"}, Description: "Workspace access through the Terraform CLI.", Category: "Infrastructure"},
	{ID: "docker", Name: "Docker", Binary: "docker", AuthCommands: []string{"docker login"}, Description: "Registry access through the Docker CLI.", Category: "Infrastructure"},
}

// KnownProvider reports whether id is one of the catalog provider ids.
func KnownProvider(id string) bool {
	for _, provider := range CLIProviders {
		if provider.ID == id {
			return true
		}
	}
	return false
}

// ProviderIDs lists the catalog provider ids, in catalog order.
func ProviderIDs() []string {
	ids := make([]string, len(CLIProviders))
	for i, provider := range CLIProviders {
		ids[i] = provider.ID
	}
	return ids
}

type Connection struct {
	ID            string
	ProjectID     string
	ProviderID    string
	Status        string
	Label         string
	EnvironmentID string
	LastSyncAt    string
	Summary       string
	CLICommand    string
	SyncInterval  string
	Freshness     string
	ErrorMessage  string
}

type Resource struct {
	ID            string
	ConnectionID  string
	Name          string
	Kind          string
	ExternalID    string
	EnvironmentID string
	Status        string
}

type SyncRun struct {
	ID           string
	ConnectionID string
	StartedAt    string
	FinishedAt   string
	Result       string
	Imported     int
	Changed      int
	Message      string
}
